import { FastifyRequest, FastifyReply } from "fastify";
import { saveLesson } from "../../services/lessons.service.js";
import { validationError } from "../../utils/errors.js";

interface SaveLessonBody {
  title: string;
  problem: string;
  root_cause?: string;
  fix: string;
  prevention_rule: string;
  stack_tags?: string[];
  category?: string;
  severity?: "critical" | "high" | "medium" | "low";
  repo_slug?: string;
  session_id?: string;
  user_handle?: string;
}

const validSeverities = new Set<string>(["critical", "high", "medium", "low"]);

export const saveLessonHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const pool = request.pool!;

  const body = request.body as SaveLessonBody;
  const {
    title,
    problem,
    root_cause,
    fix,
    prevention_rule,
    stack_tags,
    category,
    severity,
    repo_slug,
    session_id,
    user_handle,
  } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    throw validationError("title is required and must be a non-empty string");
  }
  if (!problem || typeof problem !== "string" || problem.trim().length === 0) {
    throw validationError("problem is required and must be a non-empty string");
  }
  if (!fix || typeof fix !== "string" || fix.trim().length === 0) {
    throw validationError("fix is required and must be a non-empty string");
  }
  if (
    !prevention_rule ||
    typeof prevention_rule !== "string" ||
    prevention_rule.trim().length === 0
  ) {
    throw validationError("prevention_rule is required and must be a non-empty string");
  }

  const normalizedSeverity = severity ?? "medium";
  if (!validSeverities.has(normalizedSeverity)) {
    throw validationError(`severity must be one of: critical, high, medium, low`);
  }

  const result = await saveLesson(txDb, pool, {
    title: title.trim(),
    problem: problem.trim(),
    rootCause: root_cause ?? null,
    fix: fix.trim(),
    preventionRule: prevention_rule.trim(),
    stackTags: stack_tags ?? [],
    category: category ?? null,
    severity: normalizedSeverity as "critical" | "high" | "medium" | "low",
    repoSlug: repo_slug ?? null,
    sessionId: session_id ?? null,
    userHandle: user_handle ?? null,
    projectId: request.project!.id,
  });

  reply.status(201);
  return {
    lesson_id: result.lessonId,
    embedding_status: result.embeddingStatus,
    action: result.action,
  };
};
