import { findRepositoryBySlug } from "../repositories/projects.repository.js";
import {
  insertLesson,
  findSessionById,
  incrementOccurrence as repoIncrementOccurrence,
  acquireSaveLessonLock,
  type LessonsTx,
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
