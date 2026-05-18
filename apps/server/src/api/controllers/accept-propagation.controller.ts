import { FastifyRequest, FastifyReply } from "fastify";
import { acceptPropagation } from "../../services/propagation.js";
import { validationError } from "../../utils/errors.js";

export const acceptPropagationHandler = async (
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<{ new_lesson_id: string; action: "accepted" }> => {
  const { propagation_id } = request.body as { propagation_id: string };

  if (!propagation_id) {
    throw validationError("propagation_id is required");
  }

  const db = request.txDb!;
  const projectId = request.project!.id;

  const { newLessonId } = await acceptPropagation(db, propagation_id, projectId);

  return {
    new_lesson_id: newLessonId,
    action: "accepted",
  };
};
