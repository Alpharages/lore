import { FastifyRequest, FastifyReply } from "fastify";
import { savePattern } from "../../services/patterns.service.js";

interface SavePatternBody {
  title: string;
  description: string;
  code_example?: string;
  stack_tags: string[];
  category?: string;
  external_task_id?: string;
  external_task_ref?: string;
  external_tracker_type?: "clickup" | "jira" | "asana";
}

export const savePatternHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const {
    title,
    description,
    code_example,
    stack_tags,
    category,
    external_task_id,
    external_task_ref,
    external_tracker_type,
  } = request.body as SavePatternBody;

  const result = await savePattern(txDb, {
    title,
    description,
    codeExample: code_example ?? null,
    stackTags: stack_tags,
    category: category ?? null,
    projectId: request.project!.id,
    externalTaskId: external_task_id ?? null,
    externalTaskRef: external_task_ref ?? null,
    externalTrackerType: external_tracker_type ?? null,
  });

  reply.status(201);
  return {
    pattern_id: result.patternId,
    embedding_status: result.embeddingStatus,
  };
};
