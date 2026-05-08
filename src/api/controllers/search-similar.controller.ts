import { FastifyRequest, FastifyReply } from "fastify";
import { searchSimilar } from "../../services/search-similar.service.js";

interface SearchSimilarBody {
  text: string;
  threshold?: number;
  limit?: number;
}

export const searchSimilarHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const { text, threshold = 0.7, limit = 3 } = request.body as SearchSimilarBody;

  const result = await searchSimilar(txDb, {
    text: text.trim(),
    threshold,
    limit: Math.min(limit, 20),
    projectId: request.project!.id,
  });

  reply.status(200);
  return result;
};
