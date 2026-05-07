import Fastify, { FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import { Pool } from "pg";
import { DrizzleClient } from "../services/projects.js";
import projectsRoutes from "./routes/projects.js";
import mcpRoutes from "./routes/mcp.js";

export interface BuildAppDeps {
  pool: Pool;
  db: DrizzleClient;
}

export function buildApp(deps: BuildAppDeps): FastifyInstance {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  app.register(sensible);

  // Cleanup transaction-scoped connections on response
  app.addHook("onResponse", async (request, reply) => {
    if (request.tx) {
      try {
        if (reply.statusCode >= 500 || request.txShouldRollback) {
          await request.tx.query("ROLLBACK");
        } else {
          await request.tx.query("COMMIT");
        }
      } catch {
        // ignore cleanup errors
      } finally {
        request.tx.release();
      }
    }
  });

  // Track errors for rollback decisions
  app.addHook("onError", async (request, reply, error) => {
    request.txShouldRollback = true;
  });

  app.setNotFoundHandler(async (request, reply) => {
    reply.status(404);
    return { error: "not_found" };
  });

  app.setErrorHandler(async (error, request, reply) => {
    const appError = error as any;
    if (appError.statusCode) {
      reply.status(appError.statusCode);
      if (appError.headers) {
        for (const [key, value] of Object.entries(appError.headers)) {
          reply.header(key, value);
        }
      }
      return { error: appError.code || "error", message: error.message };
    }

    request.log?.error?.(error);
    reply.status(500);
    return { error: "internal_error" };
  });

  app.register(projectsRoutes, { prefix: "/api/projects", db: deps.db });
  app.register(mcpRoutes, { prefix: "/mcp", pool: deps.pool, db: deps.db });

  return app;
}
