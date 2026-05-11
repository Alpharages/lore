import { FastifyRequest, FastifyReply } from "fastify";
import { rejectPropagation } from "../../services/propagation.js";
import { validationError } from "../../utils/errors.js";

export const rejectPropagationHandler = async (
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<{ action: "rejected" }> => {
  const { propagation_id } = request.body as { propagation_id: string };

  if (!propagation_id) {
    throw validationError("propagation_id is required");
  }

  const db = request.txDb!;
  const projectId = request.project!.id;

  await rejectPropagation(db, propagation_id, projectId);

  return {
    action: "rejected",
  };
};
