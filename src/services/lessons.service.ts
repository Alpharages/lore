import { Pool } from "pg";
import { findRepositoryBySlug } from "../repositories/projects.repository.js";
import {
  insertLesson,
  findSessionById,
  type LessonsTx,
} from "../repositories/lessons.repository.js";
import { generateAndStoreEmbedding } from "./embedding.js";
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
  embeddingStatus: "pending";
  action: "created";
}

export const saveLesson = async (
  db: LessonsTx,
  pool: Pool,
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
  });

  const embedText = `${input.title} ${input.problem} ${input.fix}`;
  setImmediate(() => {
    generateAndStoreEmbedding(pool, lessonId, input.projectId, embedText).catch(() => {});
  });

  return { lessonId, embeddingStatus: "pending", action: "created" };
};
