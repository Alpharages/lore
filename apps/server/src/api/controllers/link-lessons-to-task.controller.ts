import { FastifyRequest, FastifyReply } from "fastify";
import { linkLessonsToTask } from "../../services/sessions.service.js";

interface LinkLessonsToTaskBody {
  external_task_id: string;
  consulted: string[];
  applied: string[];
}

export const linkLessonsToTaskHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const { external_task_id, consulted, applied } = request.body as LinkLessonsToTaskBody;

  const result = await linkLessonsToTask(txDb, {
    externalTaskId: external_task_id,
    consulted: consulted ?? [],
    applied: applied ?? [],
  });

  reply.status(200);
  return result;
};
