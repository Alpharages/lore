import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { Pool } from "pg";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { createRequireProjectAuth } from "../middleware/auth.js";
import { withMcpRouteLogging } from "../../mcp/server.js";
import * as mcpController from "../controllers/mcp.controller.js";
import * as saveLessonController from "../controllers/save-lesson.controller.js";
import * as incrementOccurrenceController from "../controllers/increment-occurrence.controller.js";

const saveLessonBodySchema = {
  type: "object",
  required: ["title", "problem", "fix", "prevention_rule"],
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1 },
    problem: { type: "string", minLength: 1 },
    root_cause: { type: "string" },
    fix: { type: "string", minLength: 1 },
    prevention_rule: { type: "string", minLength: 1 },
    stack_tags: { type: "array", items: { type: "string" }, default: [] },
    category: { type: "string" },
    severity: {
      type: "string",
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    repo_slug: { type: "string", minLength: 1 },
    session_id: { type: "string", format: "uuid" },
    user_handle: { type: "string" },
  },
};

const incrementOccurrenceBodySchema = {
  type: "object",
  required: ["lesson_id"],
  additionalProperties: false,
  properties: {
    lesson_id: { type: "string", format: "uuid" },
    user_handle: { type: "string" },
  },
};

const mcpRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { pool: Pool; db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  const requireProjectAuth = createRequireProjectAuth(opts.pool, opts.db);

  app.get(
    "/whoami",
    { preHandler: [requireProjectAuth] },
    withMcpRouteLogging("whoami", mcpController.whoami)
  );

  app.post(
    "/tools/save_lesson",
    { preHandler: [requireProjectAuth], schema: { body: saveLessonBodySchema } },
    withMcpRouteLogging("save_lesson", saveLessonController.saveLessonHandler)
  );

  app.post(
    "/tools/increment_occurrence",
    {
      preHandler: [requireProjectAuth],
      schema: { body: incrementOccurrenceBodySchema },
    },
    withMcpRouteLogging(
      "increment_occurrence",
      incrementOccurrenceController.incrementOccurrenceHandler
    )
  );

  if (process.env.NODE_ENV !== "production") {
    app.get(
      "/_test/lesson-count",
      { preHandler: [requireProjectAuth] },
      withMcpRouteLogging("_test:lesson_count", mcpController.testLessonCount)
    );
  }

  done();
};

export default mcpRoute;
