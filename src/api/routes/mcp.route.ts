import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { Pool } from "pg";
import { DrizzleClient } from "../../repositories/projects.repository.js";
import { createRequireProjectAuth } from "../middleware/auth.js";
import { withMcpRouteLogging } from "../../mcp/server.js";
import * as mcpController from "../controllers/mcp.controller.js";

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
