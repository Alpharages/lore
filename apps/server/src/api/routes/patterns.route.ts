import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { requireAdminSecret } from "../middleware/admin-auth.js";
import { searchPatternsHandler, getPatternHandler } from "../controllers/patterns-ui.controller.js";

const patternsRoute = (
  app: FastifyInstance,
  opts: FastifyPluginOptions & { db: DrizzleClient },
  done: (err?: Error) => void
): void => {
  app.get(
    "/",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/patterns", db: opts.db },
      schema: {
        querystring: {
          type: "object",
          properties: {
            project: { type: "string" },
            tags: { type: "string" },
            category: { type: "string" },
            limit: { type: "string", pattern: "^[0-9]+$" },
          },
        },
      },
    },
    searchPatternsHandler
  );

  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: [requireAdminSecret],
      config: { logTool: "rest:GET:/api/patterns/:id", db: opts.db },
      schema: {
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
    },
    getPatternHandler
  );

  done();
};

export default patternsRoute;
