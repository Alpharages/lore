import { FastifyRequest, FastifyReply } from "fastify";
import { getPendingPropagationsService } from "../../services/propagation.js";
import { unauthorized } from "../../utils/errors.js";

export const getInboxHandler = async (
  request: FastifyRequest<{ Params: { slug: string } }>,
  reply: FastifyReply
): Promise<unknown> => {
  if (request.project!.slug !== request.params.slug) {
    throw unauthorized();
  }

  const projectId = request.project!.id;
  const txDb = request.txDb!;

  const results = await getPendingPropagationsService(txDb, projectId);

  reply.status(200);
  return results.map((r) => ({
    id: r.id,
    title: r.title,
    problem: r.problem,
    severity: r.severity,
    stack_tags: r.stackTags || [],
    occurrence_count: r.occurrenceCount || 0,
  }));
};
