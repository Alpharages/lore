import Fastify from "fastify";
import sensible from "@fastify/sensible";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
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
import inboxRoute from "./routes/inbox.route.js";
import lessonsRoute from "./routes/lessons.route.js";

export interface BuildAppDeps {
  pool: Pool;
  db: DrizzleClient;
  logger?: Logger;
}

export const buildApp = (deps: BuildAppDeps) => {
  const appLogger = deps.logger ?? logger;

  const app = Fastify({
    loggerInstance: appLogger as any,
    trustProxy: true,
    disableRequestLogging: true,
    // Fastify's default Ajv config strips unknown properties when a schema sets
    // `additionalProperties: false`. We want explicit rejection instead so that
    // a caller attempting to forge fields (e.g. `provenance` on save_lesson) gets
    // a 400 rather than a silent strip — matches architecture §7.1 threat model.
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: true,
      },
    },
  });

  app.register(sensible);

  // Defense-in-depth: nginx remains the primary TLS/header surface in production,
  // but the app must not be naked if it is ever exposed directly. Helmet sets a
  // conservative CSP + standard hardening headers; /health and /metrics skip the
  // CSP (they are probe endpoints with no HTML).
  app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
      },
    },
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  app.addHook("onRoute", (routeOptions) => {
    if (routeOptions.url === "/health" || routeOptions.url === "/metrics") {
      const existing = routeOptions.config as Record<string, unknown> | undefined;
      routeOptions.config = { ...(existing ?? {}), helmet: { contentSecurityPolicy: false } };
    }
  });

  // CORS is restricted to the deployed web UI origin. WEB_UI_ORIGIN may be a
  // comma-separated list (e.g. "https://lore.example.com,http://localhost:3001").
  // When unset, CORS is disabled (same-origin only) — the safer default.
  const webUiOrigin = process.env.WEB_UI_ORIGIN?.trim();
  const corsOrigins = webUiOrigin
    ? webUiOrigin
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : false;
  app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  });

  // Commit or rollback before the response is sent so inject-based tests can
  // query the DB immediately after the inject promise resolves (onResponse fires
  // after the response is sent and therefore after inject resolves, making the
  // commit invisible to tests that query synchronously).
  app.addHook("onSend", async (request, reply, payload) => {
    if (!request.tx) return payload;
    try {
      if (reply.statusCode >= 500 || request.txShouldRollback) {
        await request.tx.query("ROLLBACK");
      } else {
        await request.tx.query("COMMIT");
      }
    } catch {
      // ignore cleanup errors
    }
    return payload;
  });

  // Release the pool connection after the response is fully sent
  app.addHook("onResponse", async (request) => {
    if (request.tx) {
      request.tx.release();
    }
  });

  // Track errors for rollback decisions
  app.addHook("onError", async (request) => {
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
    const message = appError?.message ?? String(error);

    // Fastify schema validation errors (body, params, querystring, headers).
    // Normalise to the same { error: "validation_error" } shape used by AppError.
    if (appError.validation) {
      reply.status(400);
      return { error: "validation_error", message };
    }

    if (appError.statusCode) {
      reply.status(appError.statusCode);
      if (appError.headers) {
        for (const [key, value] of Object.entries(appError.headers)) {
          reply.header(key, value);
        }
      }
      return { error: appError.code || "error", message };
    }

    request.log.error(error);
    reply.status(500);
    return { error: "internal_error" };
  });

  app.register(projectsRoute, { prefix: "/api/projects", db: deps.db });
  app.register(lessonsRoute, { prefix: "/api/lessons", db: deps.db });
  app.register(inboxRoute, { prefix: "/api", pool: deps.pool, db: deps.db });
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
