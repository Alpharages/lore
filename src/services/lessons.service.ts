import { findRepositoryBySlug } from "../repositories/projects.repository.js";
import {
  insertLesson,
  findSessionById,
  incrementOccurrence as repoIncrementOccurrence,
  acquireSaveLessonLock,
  queryLessons as repoQueryLessons,
  findLessonsForTask,
  findPatternsForTask,
  type LessonsTx,
  type LessonRow,
} from "../repositories/lessons.repository.js";
import { generateEmbeddingText, generateEmbedding } from "./embedding.js";
import { findDuplicate } from "./deduplication.js";
import { validationError } from "../utils/errors.js";

export interface SaveLessonInput {
  title: string;
  problem: string;
  rootCause?: string | null;
  fix: string;
  preventionRule: string;
  stackTags: string[];
  category?: string | null;
  severity: "critical" | "high" | "medium" | "low";
  repoSlug?: string | null;
  sessionId?: string | null;
  userHandle?: string | null;
  projectId: string;
}

export interface SaveLessonOutput {
  lessonId: string;
  embeddingStatus: "pending" | "complete";
  action: "created" | "incremented";
}

// Architectural note (resolves D1, D2, D3 from the M2 code review):
//
// D1 — Embedding is intentionally SYNCHRONOUS in the request path. PRD FR-26
//   mandates pre-insert semantic dedup (cosine ≥ 0.90) and dedup needs the
//   embedding before the INSERT can decide between create vs increment. The
//   original Story 2.1 ACs ("async, returns embedding_status: pending") are
//   superseded by FR-26. Trade-off: P95 now blocks on OpenAI (~100–500ms).
//   When the OpenAI call fails (`generateEmbedding` returns null) we fall back
//   to inserting with embedding_status='pending' and SKIP dedup — accepted
//   v1 behaviour, deferred reconciliation may revisit.
//
// D2 — Story 2.1 + 2.2 work is intentionally bundled here: dedup, the
//   `action: "incremented"` return path, and the `increment_occurrence` tool
//   ship together. Splitting them late would have churned the same files
//   twice.
//
// D3 — `increment_occurrence` is exposed as a public MCP tool so downstream
//   skills (e.g. `capture_review_finding`) can bump occurrence counts without
//   re-running the embedding/dedup pipeline. RLS scoping keeps it safe.
export const saveLesson = async (
  db: LessonsTx,
  input: SaveLessonInput
): Promise<SaveLessonOutput> => {
  const provenance = {
    source: "manual",
    captured_by: input.userHandle ?? "unknown",
    trust_tier: "manual",
  };

  let repoId: string | null = null;
  if (input.repoSlug) {
    const repo = await findRepositoryBySlug(db, input.repoSlug);
    if (!repo) {
      throw validationError(`repo_slug '${input.repoSlug}' not found for this project`);
    }
    repoId = repo.id;
  }

  // Validate session belongs to the current project via RLS-scoped query.
  // If the session doesn't exist or belongs to another project, RLS returns
  // no rows — treat as absent rather than failing with a FK or isolation error.
  let resolvedSessionId: string | null = input.sessionId ?? null;
  if (resolvedSessionId) {
    const session = await findSessionById(db, resolvedSessionId);
    if (!session) {
      resolvedSessionId = null;
    }
  }

  const embedText = generateEmbeddingText({
    title: input.title,
    problem: input.problem,
    fix: input.fix,
    preventionRule: input.preventionRule,
  });

  const embedding = await generateEmbedding(embedText);

  if (embedding) {
    // Serialise concurrent saves within the same project so the dedup-check
    // and the subsequent INSERT/UPDATE form an atomic critical section.
    // Released automatically when the request transaction commits/rollbacks.
    await acquireSaveLessonLock(db, input.projectId);

    const duplicate = await findDuplicate(db, embedding, input.projectId);

    if (duplicate) {
      const result = await repoIncrementOccurrence(
        db,
        duplicate.lessonId,
        input.projectId,
        input.userHandle ?? null
      );
      return {
        lessonId: result.lessonId,
        embeddingStatus: "complete",
        action: "incremented",
      };
    }

    const { id: lessonId } = await insertLesson(db, {
      projectId: input.projectId,
      repoId,
      sessionId: resolvedSessionId,
      title: input.title,
      problem: input.problem,
      rootCause: input.rootCause ?? null,
      fix: input.fix,
      preventionRule: input.preventionRule,
      stackTags: input.stackTags,
      category: input.category ?? null,
      severity: input.severity,
      capturedByUser: input.userHandle ?? null,
      provenance,
      embedding,
      embeddingStatus: "complete",
    });

    return { lessonId, embeddingStatus: "complete", action: "created" };
  }

  // Embedding generation failed — save without dedup
  const { id: lessonId } = await insertLesson(db, {
    projectId: input.projectId,
    repoId,
    sessionId: resolvedSessionId,
    title: input.title,
    problem: input.problem,
    rootCause: input.rootCause ?? null,
    fix: input.fix,
    preventionRule: input.preventionRule,
    stackTags: input.stackTags,
    category: input.category ?? null,
    severity: input.severity,
    capturedByUser: input.userHandle ?? null,
    provenance,
    embeddingStatus: "pending",
  });

  return { lessonId, embeddingStatus: "pending", action: "created" };
};

export const incrementOccurrence = async (
  db: LessonsTx,
  lessonId: string,
  projectId: string,
  userHandle: string | null
): Promise<{ lessonId: string; newCount: number }> => {
  return repoIncrementOccurrence(db, lessonId, projectId, userHandle);
};

export interface QueryLessonsInput {
  stackTags?: string[];
  category?: string;
  severity?: "critical" | "high" | "medium" | "low";
  lastNDays?: number;
  repoSlug?: string;
  limit?: number;
}

export interface QueryLessonResult {
  id: string;
  title: string;
  problem: string;
  root_cause: string | null;
  fix: string;
  prevention_rule: string;
  stack_tags: string[];
  category: string | null;
  severity: string | null;
  occurrence_count: number;
  last_seen_at: string | null;
  relevance_score: number;
}

export interface QueryLessonsOutput {
  lessons: QueryLessonResult[];
  total: number;
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 1,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

const scoreLesson = (row: LessonRow, inputTags: string[]): number => {
  const daysSinceSeen = row.lastSeenAt ? (Date.now() - row.lastSeenAt.getTime()) / 86_400_000 : 365;
  const recency = 1 / (1 + daysSinceSeen);
  const frequency = Math.log1p(row.occurrenceCount ?? 1) / Math.log1p(100);
  const severity = SEVERITY_WEIGHT[row.severity ?? "medium"] ?? 0.5;
  const overlap =
    inputTags.length > 0
      ? (row.stackTags ?? []).filter((tag) => inputTags.includes(tag)).length / inputTags.length
      : 0;

  return recency * 0.35 + frequency * 0.3 + severity * 0.25 + overlap * 0.1;
};

export const queryLessons = async (
  db: LessonsTx,
  input: QueryLessonsInput
): Promise<QueryLessonsOutput> => {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);

  let repoId: string | null = null;
  if (input.repoSlug) {
    const repo = await findRepositoryBySlug(db, input.repoSlug);
    if (!repo) {
      return { lessons: [], total: 0 };
    }
    repoId = repo.id;
  }

  const rows = await repoQueryLessons(db, {
    stackTags: input.stackTags,
    category: input.category,
    severity: input.severity,
    lastNDays: input.lastNDays,
    repoId,
    limit: limit * 4,
  });

  const inputTags = input.stackTags ?? [];
  const scored = rows
    .map((row) => ({ row, score: scoreLesson(row, inputTags) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    lessons: scored.map(({ row, score }) => ({
      id: row.id,
      title: row.title,
      problem: row.problem,
      root_cause: row.rootCause,
      fix: row.fix,
      prevention_rule: row.preventionRule,
      stack_tags: row.stackTags ?? [],
      category: row.category,
      severity: row.severity,
      occurrence_count: row.occurrenceCount ?? 1,
      last_seen_at: row.lastSeenAt?.toISOString() ?? null,
      relevance_score: Math.round(score * 1000) / 1000,
    })),
    total: scored.length,
  };
};

/* ------------------------------------------------------------------
 * query_lessons_for_task — service layer
 * ------------------------------------------------------------------ */

export interface QueryLessonsForTaskInput {
  externalTaskId: string;
  taskContext?: {
    title?: string;
    description?: string;
    acceptanceCriteria?: string;
    parentEpicId?: string;
    stackTags?: string[];
  };
  limit?: number;
  projectId: string;
}

export interface QueryLessonForTaskResult {
  id: string;
  title: string;
  problem: string;
  root_cause: string | null;
  fix: string;
  prevention_rule: string;
  stack_tags: string[];
  category: string | null;
  severity: string | null;
  occurrence_count: number;
  last_seen_at: string | null;
  relevance_score: number;
  match_reason: string;
}

export interface QueryPatternForTaskResult {
  id: string;
  title: string;
  description: string;
  code_example: string | null;
  stack_tags: string[];
  category: string | null;
  usage_count: number;
  last_used_at: string | null;
  relevance_score: number;
  match_reason: string;
}

export interface QueryLessonsForTaskOutput {
  lessons: QueryLessonForTaskResult[];
  patterns: QueryPatternForTaskResult[];
  total: number;
}

interface ScoreableItem {
  lastSeenAt?: Date | null;
  lastUsedAt?: Date | null;
  occurrenceCount?: number | null;
  usageCount?: number | null;
  severity: string | null;
  stackTags: string[] | null;
}

const scoreItemBase = (row: ScoreableItem, inputTags: string[]): number => {
  const timeField = row.lastSeenAt ?? row.lastUsedAt;
  const countField = row.occurrenceCount ?? row.usageCount;
  const daysSince = timeField ? (Date.now() - timeField.getTime()) / 86_400_000 : 365;
  const recency = 1 / (1 + daysSince);
  const frequency = Math.log1p(countField ?? 1) / Math.log1p(100);
  const severity = SEVERITY_WEIGHT[row.severity ?? "medium"] ?? 0.5;
  const overlap =
    inputTags.length > 0
      ? (row.stackTags ?? []).filter((tag) => inputTags.includes(tag)).length / inputTags.length
      : 0;

  return recency * 0.35 + frequency * 0.3 + severity * 0.25 + overlap * 0.1;
};

const semanticBonus = (similarity: number): number => {
  if (similarity >= 0.8) return 0.2;
  if (similarity >= 0.7) return 0.1;
  return 0;
};

export const queryLessonsForTask = async (
  db: LessonsTx,
  input: QueryLessonsForTaskInput
): Promise<QueryLessonsForTaskOutput> => {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 20);
  const stackTags = input.taskContext?.stackTags ?? [];

  let queryEmbedding: number[] | null = null;
  if (input.taskContext?.title && input.taskContext?.description) {
    const embedText = `${input.taskContext.title} ${input.taskContext.description}`.trim();
    queryEmbedding = await generateEmbedding(embedText);
  }

  const [lessonRows, patternRows] = await Promise.all([
    findLessonsForTask(db, {
      projectId: input.projectId,
      externalTaskId: input.externalTaskId,
      queryEmbedding,
      stackTags: stackTags.length > 0 ? stackTags : undefined,
      parentEpicId: input.taskContext?.parentEpicId,
      limit: limit * 4,
    }),
    findPatternsForTask(db, {
      projectId: input.projectId,
      stackTags: stackTags.length > 0 ? stackTags : undefined,
      queryEmbedding,
      limit: Math.ceil(limit / 2),
    }),
  ]);

  const scoredLessons = lessonRows
    .map((row) => {
      const baseScore = scoreItemBase(row, stackTags);
      const score = baseScore + semanticBonus(row.similarity);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);

  const scoredPatterns = patternRows
    .map((row) => {
      const baseScore = scoreItemBase(
        {
          lastUsedAt: row.lastUsedAt,
          usageCount: row.usageCount,
          severity: null,
          stackTags: row.stackTags,
        },
        stackTags
      );
      const score = baseScore + semanticBonus(row.similarity);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);

  type MergedItem =
    | { type: "lesson"; score: number; data: QueryLessonForTaskResult }
    | { type: "pattern"; score: number; data: QueryPatternForTaskResult };

  const merged: MergedItem[] = [
    ...scoredLessons.map(({ row, score }) => ({
      type: "lesson" as const,
      score,
      data: {
        id: row.id,
        title: row.title,
        problem: row.problem,
        root_cause: row.rootCause,
        fix: row.fix,
        prevention_rule: row.preventionRule,
        stack_tags: row.stackTags ?? [],
        category: row.category,
        severity: row.severity,
        occurrence_count: row.occurrenceCount ?? 1,
        last_seen_at: row.lastSeenAt?.toISOString() ?? null,
        relevance_score: Math.round(score * 1000) / 1000,
        match_reason: row.matchReason,
      },
    })),
    ...scoredPatterns.map(({ row, score }) => ({
      type: "pattern" as const,
      score,
      data: {
        id: row.id,
        title: row.title,
        description: row.description,
        code_example: row.codeExample,
        stack_tags: row.stackTags ?? [],
        category: row.category,
        usage_count: row.usageCount ?? 1,
        last_used_at: row.lastUsedAt?.toISOString() ?? null,
        relevance_score: Math.round(score * 1000) / 1000,
        match_reason: row.matchReason,
      },
    })),
  ];

  merged.sort((a, b) => b.score - a.score);
  const sliced = merged.slice(0, limit);

  const lessons = sliced
    .filter((item): item is Extract<MergedItem, { type: "lesson" }> => item.type === "lesson")
    .map((item) => item.data);

  const patterns = sliced
    .filter((item): item is Extract<MergedItem, { type: "pattern" }> => item.type === "pattern")
    .map((item) => item.data);

  return {
    lessons,
    patterns,
    total: lessons.length + patterns.length,
  };
};
