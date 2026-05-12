import {
  insertLesson,
  incrementOccurrence as repoIncrementOccurrence,
  acquireSaveLessonLock,
  findLessonByExternalTaskAndTitle,
  type LessonsTx,
} from "../repositories/lessons.repository.js";
import { generateEmbeddingText, generateEmbedding } from "./embedding.js";
import { findDuplicate } from "./deduplication.js";

export interface CaptureReviewFindingInput {
  externalTaskId: string;
  externalTrackerType: "clickup" | "jira" | "asana";
  externalTaskRef?: string | null;
  severity: "critical" | "high" | "medium" | "low";
  finding: {
    title: string;
    problem: string;
    rootCause?: string | null;
    fix: string;
    preventionRule: string;
    stackTags?: string[];
    category?: string | null;
    codePointer?: {
      file: string;
      lineStart: number;
      lineEnd: number;
    } | null;
  };
  reviewer?: string | null;
  workflow?: string | null;
  projectId: string;
}

export interface CaptureReviewFindingOutput {
  lessonId: string;
  embeddingStatus: "pending" | "complete";
  action: "created" | "incremented";
}

const skillByTracker: Record<string, string> = {
  clickup: "clickup-code-review",
  jira: "jira-code-review",
  asana: "asana-code-review",
};

export const captureReviewFinding = async (
  db: LessonsTx,
  input: CaptureReviewFindingInput
): Promise<CaptureReviewFindingOutput> => {
  const provenance = {
    source: "bmad-code-review",
    workflow: input.workflow ?? null,
    skill: skillByTracker[input.externalTrackerType] ?? "code-review",
    task_id: input.externalTaskId,
    reviewer: input.reviewer ?? null,
    trust_tier: "high",
    captured_at: new Date().toISOString(),
    code_pointer: input.finding.codePointer
      ? {
          file: input.finding.codePointer.file,
          line_start: input.finding.codePointer.lineStart,
          line_end: input.finding.codePointer.lineEnd,
        }
      : null,
  };

  const embedText = generateEmbeddingText({
    title: input.finding.title,
    problem: input.finding.problem,
    fix: input.finding.fix,
    preventionRule: input.finding.preventionRule,
  });

  const embedding = await generateEmbedding(embedText);

  const baseValues = {
    projectId: input.projectId,
    repoId: null,
    sessionId: null,
    title: input.finding.title,
    problem: input.finding.problem,
    rootCause: input.finding.rootCause ?? null,
    fix: input.finding.fix,
    preventionRule: input.finding.preventionRule,
    stackTags: input.finding.stackTags ?? [],
    category: input.finding.category ?? null,
    severity: input.severity,
    capturedByUser: input.reviewer ?? null,
    provenance,
    externalTaskId: input.externalTaskId,
    externalTaskRef: input.externalTaskRef ?? null,
    externalTrackerType: input.externalTrackerType,
  };

  await acquireSaveLessonLock(db, input.projectId);

  if (embedding) {
    const duplicate = await findDuplicate(db, embedding, input.projectId);

    if (duplicate) {
      const result = await repoIncrementOccurrence(
        db,
        duplicate.lessonId,
        input.projectId,
        input.reviewer ?? null
      );
      return {
        lessonId: result.lessonId,
        embeddingStatus: "complete",
        action: "incremented",
      };
    }

    const { id: lessonId } = await insertLesson(db, {
      ...baseValues,
      embedding,
      embeddingStatus: "complete",
    });

    return { lessonId, embeddingStatus: "complete", action: "created" };
  }

  // Embedding failed — fall back to (project, externalTaskId, title) idempotency check
  const existing = await findLessonByExternalTaskAndTitle(
    db,
    input.projectId,
    input.externalTaskId,
    input.finding.title
  );

  if (existing) {
    const result = await repoIncrementOccurrence(
      db,
      existing.id,
      input.projectId,
      input.reviewer ?? null
    );
    return {
      lessonId: result.lessonId,
      embeddingStatus: "pending",
      action: "incremented",
    };
  }

  const { id: lessonId } = await insertLesson(db, {
    ...baseValues,
    embeddingStatus: "pending",
  });

  return { lessonId, embeddingStatus: "pending", action: "created" };
};
