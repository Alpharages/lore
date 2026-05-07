import Fastify, { FastifyInstance, FastifyBaseLogger } from "fastify";
import sensible from "@fastify/sensible";
import { Pool } from "pg";
import type { Logger } from "pino";
import { DrizzleClient } from "../repositories/projects.repository.js";
import { setDbPoolUtilization, setPostgresDiskUsageRatio } from "../services/metrics.js";
import { getDiskUsageRatio } from "../services/disk-usage.js";
import { logger, maskProjectId } from "../utils/logger.js";
import projectsRoute from "./routes/projects.route.js";
import mcpRoute from "./routes/mcp.route.js";
import healthRoute from "./routes/health.route.js";
import metricsRoute from "./routes/metrics.route.js";

export interface BuildAppDeps {
  pool: Pool;
  db: DrizzleClient;
  logger?: Logger;
}

export const buildApp = (deps: BuildAppDeps) => {
  const appLogger = deps.logger ?? logger;

  const app = Fastify({
    logger: appLogger as any,
    trustProxy: true,
    disableRequestLogging: true,
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

  // Structured REST route logging (AC-7) — only for routes that opt in
  app.addHook("onResponse", async (request, reply) => {
    const logTool = (request.routeOptions.config as any)?.logTool;
    if (!logTool) return;

    const durationMs = Math.round(reply.elapsedTime);
    const statusCode = reply.statusCode;
    const success = statusCode < 400;
    const projectId = request.project?.id ? maskProjectId(request.project.id) : "-";

    const logLine: Record<string, unknown> = {
      tool: logTool,
      project_id: projectId,
      duration_ms: durationMs,
      success,
      status_code: statusCode,
    };

    if (success) {
      request.log.info(logLine);
    } else {
      request.log.warn(logLine);
    }
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

    request.log.error(error);
    reply.status(500);
    return { error: "internal_error" };
  });

  app.register(projectsRoute, { prefix: "/api/projects", db: deps.db });
  app.register(mcpRoute, { prefix: "/mcp", pool: deps.pool, db: deps.db });
  app.register(healthRoute, { prefix: "/", db: deps.db });
  app.register(metricsRoute, { prefix: "/" });

  // Pool utilization + disk usage sampler — updates every 5s
  const poolInterval = setInterval(() => {
    const max = (deps.pool as any).options?.max || 10;
    const total = deps.pool.totalCount;
    const idle = deps.pool.idleCount;
    const used = total - idle;
    const ratio = max > 0 ? used / max : 0;
    setDbPoolUtilization(ratio);
    getDiskUsageRatio(deps.db)
      .then(setPostgresDiskUsageRatio)
      .catch(() => {});
  }, 5000);

  app.addHook("onClose", async () => {
    clearInterval(poolInterval);
  });

  return app;
};
