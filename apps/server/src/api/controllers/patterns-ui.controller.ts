import { FastifyRequest, FastifyReply } from "fastify";
import { searchPatternsForUi, findPatternByIdForUi } from "../../services/patterns.service.js";
import { DrizzleClient } from "../../repositories/projects.repository.js";

interface RouteConfig {
  db: DrizzleClient;
}

const getDb = (request: FastifyRequest): DrizzleClient =>
  (request.routeOptions.config as unknown as RouteConfig).db;

export const searchPatternsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const db = getDb(request);
  const query = request.query as {
    project?: string;
    tags?: string | string[];
    category?: string;
    limit?: string;
  };

  const tags = normalizeArray(query.tags);
  const limit = query.limit ? parseInt(query.limit, 10) : undefined;

  const result = await searchPatternsForUi(db, {
    projectSlug: query.project,
    tags,
    category: query.category ?? null,
    limit,
  });

  reply.status(200);
  return { patterns: result.patterns, total: result.total };
};

export const getPatternHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const db = getDb(request);
  const { id } = request.params as { id: string };

  const row = await findPatternByIdForUi(db, id);
  if (!row) {
    reply.status(404);
    return { error: "not_found" };
  }

  reply.status(200);
  return row;
};

const normalizeArray = (value: string | string[] | undefined): string[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const filtered = value.map((s) => s.trim()).filter(Boolean);
    return filtered.length > 0 ? filtered : undefined;
  }
  const filtered = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return filtered.length > 0 ? filtered : undefined;
};
