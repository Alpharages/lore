import { FastifyRequest, FastifyReply } from "fastify";
import { saveLesson } from "../../services/lessons.service.js";

// Body shape after Fastify schema validation — required fields are guaranteed
// present and non-empty; optional fields have defaults applied by Ajv.
interface SaveLessonBody {
  title: string;
  problem: string;
  root_cause?: string;
  fix: string;
  prevention_rule: string;
  stack_tags: string[]; // default [] applied by schema
  category?: string;
  severity: "critical" | "high" | "medium" | "low"; // default "medium" applied by schema
  repo_slug?: string;
  session_id?: string;
  user_handle?: string;
}

export const saveLessonHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;

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
  } = request.body as SaveLessonBody;

  const result = await saveLesson(txDb, {
    title: title.trim(),
    problem: problem.trim(),
    rootCause: root_cause ?? null,
    fix: fix.trim(),
    preventionRule: prevention_rule.trim(),
    stackTags: stack_tags,
    category: category ?? null,
    severity,
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
