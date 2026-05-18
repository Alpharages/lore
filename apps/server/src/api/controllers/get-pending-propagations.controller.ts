import { FastifyRequest, FastifyReply } from "fastify";
import { getPendingPropagationsService } from "../../services/propagation.js";

export const getPendingPropagationsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> => {
  const projectId = request.project!.id;
  const txDb = request.txDb!;

  const results = await getPendingPropagationsService(txDb, projectId);

  // Return formatted array mapping to the requested properties
  // Note: Drizzle returns camelCase columns (occurrenceCount, stackTags),
  // but snake_case is expected in the JSON response
  const mappedResults = results.map((r) => ({
    id: r.id,
    title: r.title,
    problem: r.problem,
    severity: r.severity,
    stack_tags: r.stackTags || [],
    occurrence_count: r.occurrenceCount || 0,
  }));

  reply.status(200);
  return mappedResults;
};
