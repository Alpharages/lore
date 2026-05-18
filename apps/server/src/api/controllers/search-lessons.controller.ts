import { FastifyRequest, FastifyReply } from "fastify";
import { searchLessonsForUi, findLessonByIdForUi } from "../../services/lessons.service.js";
import { DrizzleClient } from "../../repositories/projects.repository.js";

interface RouteConfig {
  db: DrizzleClient;
}

const getDb = (request: FastifyRequest): DrizzleClient =>
  (request.routeOptions.config as unknown as RouteConfig).db;

const toCamelLesson = (row: {
  id: string;
  title: string;
  problem: string;
  root_cause: string | null;
  fix: string;
  prevention_rule: string;
  stack_tags: string[];
  category: string | null;
  severity: string | null;
  occurrence_count: number;
  last_seen_at: string | null;
  relevance_score: number;
  provenance: Record<string, unknown> | null;
}) => ({
  id: row.id,
  title: row.title,
  problem: row.problem,
  rootCause: row.root_cause,
  fix: row.fix,
  preventionRule: row.prevention_rule,
  stackTags: row.stack_tags,
  category: row.category,
  severity: row.severity,
  occurrenceCount: row.occurrence_count,
  lastSeen: row.last_seen_at,
  relevanceScore: row.relevance_score,
  provenance: parseProvenance(row.provenance),
});

const parseProvenance = (provenance: Record<string, unknown> | null): string => {
  if (!provenance) return "manual";
  const source = provenance.source;
  if (source === "bmad-code-review") return "code_review";
  if (source === "propagated") return "propagated";
  return "manual";
};

export const searchLessonsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const db = getDb(request);
  const query = request.query as {
    q?: string;
    project?: string;
    tags?: string | string[];
    severity?: string | string[];
    category?: string;
    limit?: string;
  };

  const tags = normalizeArray(query.tags);
  const severity = normalizeArray(query.severity);
  const limit = query.limit ? parseInt(query.limit, 10) : undefined;

  const result = await searchLessonsForUi(db, {
    q: query.q,
    projectSlug: query.project,
    tags,
    severity,
    category: query.category,
    limit,
  });

  reply.status(200);
  return { lessons: result.lessons.map(toCamelLesson) };
};

export const getLessonHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const db = getDb(request);
  const { id } = request.params as { id: string };

  const row = await findLessonByIdForUi(db, id);
  if (!row) {
    reply.status(404);
    return { error: "not_found" };
  }

  reply.status(200);
  return {
    id: row.id,
    title: row.title,
    problem: row.problem,
    rootCause: row.rootCause,
    fix: row.fix,
    preventionRule: row.preventionRule,
    stackTags: row.stackTags ?? [],
    category: row.category,
    severity: row.severity,
    provenance: parseProvenance(row.provenance as Record<string, unknown> | null),
  };
};

const normalizeArray = (value: string | string[] | undefined): string[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  return value.split(",").map((s) => s.trim());
};
