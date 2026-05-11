import { FastifyRequest, FastifyReply } from "fastify";
import { acceptPropagation, rejectPropagation } from "../../services/propagation.js";

export const acceptPropagationRestHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  _reply: FastifyReply
): Promise<{ new_lesson_id: string; action: "accepted" }> => {
  const db = request.txDb!;
  const projectId = request.project!.id;
  const { newLessonId } = await acceptPropagation(db, request.params.id, projectId);
  return { new_lesson_id: newLessonId, action: "accepted" };
};

export const rejectPropagationRestHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  _reply: FastifyReply
): Promise<{ action: "rejected" }> => {
  const db = request.txDb!;
  const projectId = request.project!.id;
  await rejectPropagation(db, request.params.id, projectId);
  return { action: "rejected" };
};
