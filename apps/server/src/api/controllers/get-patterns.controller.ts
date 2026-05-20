import { FastifyRequest, FastifyReply } from "fastify";
import { getPatterns } from "../../services/patterns.service.js";

interface GetPatternsBody {
  stack_tags?: string[];
  category?: string;
  limit?: number;
}

export const getPatternsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const { stack_tags, category, limit } = request.body as GetPatternsBody;

  const result = await getPatterns(txDb, {
    stackTags: stack_tags,
    category: category ?? null,
    projectId: request.project!.id,
    limit,
  });

  reply.status(200);
  return result;
};
