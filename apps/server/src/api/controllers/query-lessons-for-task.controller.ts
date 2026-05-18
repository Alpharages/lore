import { FastifyRequest, FastifyReply } from "fastify";
import { queryLessonsForTask } from "../../services/lessons.service.js";

interface QueryLessonsForTaskBody {
  external_task_id: string;
  task_context?: {
    title?: string;
    description?: string;
    acceptance_criteria?: string;
    parent_epic_id?: string;
    stack_tags?: string[];
  };
  limit?: number;
}

export const queryLessonsForTaskHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const { external_task_id, task_context, limit } = request.body as QueryLessonsForTaskBody;

  const result = await queryLessonsForTask(txDb, {
    externalTaskId: external_task_id,
    taskContext: task_context
      ? {
          title: task_context.title,
          description: task_context.description,
          acceptanceCriteria: task_context.acceptance_criteria,
          parentEpicId: task_context.parent_epic_id,
          stackTags: task_context.stack_tags,
        }
      : undefined,
    limit,
    projectId: request.project!.id,
  });

  reply.status(200);
  return result;
};
