import { FastifyRequest, FastifyReply } from "fastify";
import { queryLessons } from "../../services/lessons.service.js";

interface QueryLessonsBody {
  stack_tags: string[];
  category?: string;
  severity?: "critical" | "high" | "medium" | "low";
  last_n_days?: number;
  repo_slug?: string;
  limit: number;
}

export const queryLessonsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const txDb = request.txDb!;
  const { stack_tags, category, severity, last_n_days, repo_slug, limit } =
    request.body as QueryLessonsBody;

  const result = await queryLessons(txDb, {
    stackTags: stack_tags,
    category,
    severity,
    lastNDays: last_n_days,
    repoSlug: repo_slug,
    limit,
  });

  reply.status(200);
  return result;
};
