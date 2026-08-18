import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { Pool } from "pg";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { createRequireAdminProjectScope } from "../middleware/admin-project-scope.js";
import {
  listCurrentStateHandler,
  listProposalsHandler,
  historyHandler,
  getItemHandler,
  reviewItemHandler,
  exportHandler,
} from "../controllers/project-evolution-ui.controller.js";
import {
  PROJECT_EVOLUTION_REVIEW_ACTIONS,
  evidenceArraySchema,
} from "./project-evolution-schemas.js";

/**
 * Web UI REST surface for Project Evolution (FR-PE-60 … FR-PE-65).
 *
 * The per-project MCP tool routes live in mcp.route.ts; these are the
 * admin-secret routes the Next.js app proxies to, scoped by `?project=<slug>`.
 */
const projectEvolutionRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { pool: Pool; db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  const requireScope = createRequireAdminProjectScope(opts.pool, opts.db);

  const projectQuerystring = (extra: Record<string, unknown> = {}) => ({
    type: "object",
    required: ["project"],
    properties: {
      project: { type: "string", minLength: 1 },
      ...extra,
    },
  });

  app.get(
    "/current",
    {
      preHandler: [requireScope],
      config: { logTool: "rest:GET:/api/project-evolution/current" },
      schema: {
        querystring: projectQuerystring({
          types: { type: "string" },
          limit: { type: "string", pattern: "^[0-9]+$" },
          offset: { type: "string", pattern: "^[0-9]+$" },
        }),
      },
    },
    listCurrentStateHandler
  );

  app.get(
    "/proposals",
    {
      preHandler: [requireScope],
      config: { logTool: "rest:GET:/api/project-evolution/proposals" },
      schema: {
        querystring: projectQuerystring({
          limit: { type: "string", pattern: "^[0-9]+$" },
          offset: { type: "string", pattern: "^[0-9]+$" },
        }),
      },
    },
    listProposalsHandler
  );

  app.get(
    "/history",
    {
      preHandler: [requireScope],
      config: { logTool: "rest:GET:/api/project-evolution/history" },
      schema: {
        querystring: projectQuerystring({
          types: { type: "string" },
          statuses: { type: "string" },
          event_types: { type: "string" },
          item_id: { type: "string", format: "uuid" },
          since: { type: "string" },
          until: { type: "string" },
          limit: { type: "string", pattern: "^[0-9]+$" },
          offset: { type: "string", pattern: "^[0-9]+$" },
        }),
      },
    },
    historyHandler
  );

  app.get(
    "/export",
    {
      preHandler: [requireScope],
      config: { logTool: "rest:GET:/api/project-evolution/export" },
      schema: {
        querystring: projectQuerystring({
          format: { type: "string", enum: ["json", "jsonl"] },
          include_excerpts: { type: "string", enum: ["true", "false"] },
        }),
      },
    },
    exportHandler
  );

  app.get<{ Params: { id: string } }>(
    "/items/:id",
    {
      preHandler: [requireScope],
      config: { logTool: "rest:GET:/api/project-evolution/items/:id" },
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        querystring: projectQuerystring(),
      },
    },
    getItemHandler
  );

  app.post<{ Params: { id: string } }>(
    "/items/:id/review",
    {
      preHandler: [requireScope],
      config: { logTool: "rest:POST:/api/project-evolution/items/:id/review" },
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        querystring: projectQuerystring(),
        body: {
          type: "object",
          required: ["action"],
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: PROJECT_EVOLUTION_REVIEW_ACTIONS },
            reviewer: { type: "string" },
            note: { type: "string" },
            title: { type: "string" },
            statement: { type: "string" },
            rationale: { type: "string" },
            supersedes_item_id: { type: "string", format: "uuid" },
            evidence: evidenceArraySchema,
            evidence_id: { type: "string", format: "uuid" },
            redaction_reason: { type: "string" },
          },
        },
      },
    },
    reviewItemHandler
  );

  done();
};

export default projectEvolutionRoute;
