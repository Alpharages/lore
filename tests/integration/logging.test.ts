import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { Writable } from "stream";
import type { Logger } from "pino";
import {
  createTestPool,
  createTestDb,
  buildTestApp,
  resetDatabase,
} from "./helper.js";
import { createLogger, maskProjectId } from "../../src/utils/logger.js";
import { clearFailures } from "../../src/api/middleware/rate-limit.js";
import { createRequireProjectAuth } from "../../src/api/middleware/auth.js";
import { withMcpRouteLogging } from "../../src/mcp/server.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

function makeCapturedLogger(logLevel?: string): { logger: Logger; lines: () => Array<Record<string, unknown>> } {
  const rawLines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      const str = chunk.toString().trim();
      if (str) rawLines.push(str);
      callback();
    },
  });

  const prev = process.env.LOG_LEVEL;
  if (logLevel) process.env.LOG_LEVEL = logLevel;
  const logger = createLogger(destination as any);
  if (logLevel) {
    if (prev === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = prev;
  }

  return {
    logger,
    lines: () =>
      rawLines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { _raw: line };
        }
      }),
  };
}

describe("Structured Logging (AC-1 — AC-8)", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;

  beforeAll(() => {
    pool = createTestPool();
    db = createTestDb(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    clearFailures();
  });

  async function registerProject(app: any, slug: string) {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/register",
      headers: {
        "x-admin-secret": ADMIN_SECRET,
        "content-type": "application/json",
      },
      payload: { name: slug, slug },
    });
    return JSON.parse(res.payload);
  }

  describe("AC-1 — MCP tool envelope", () => {
    it("emits the §8.1 shape for a successful MCP tool call", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);
      const { api_key } = await registerProject(app, "acme");

      const res = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });
      expect(res.statusCode).toBe(200);

      const toolLines = lines().filter((l) => l.tool === "whoami");
      expect(toolLines).toHaveLength(1);

      const line = toolLines[0];
      expect(line.level).toBe("info");
      expect(line.tool).toBe("whoami");
      expect(line.project_id).toMatch(/^[0-9a-f]{8}-…-[0-9a-f]{4}$/);
      expect(typeof line.duration_ms).toBe("number");
      expect(line.duration_ms).toBeGreaterThanOrEqual(0);
      expect(line.success).toBe(true);
      expect(line.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  });

  describe("AC-2 — masked project_id", () => {
    it("never logs the full UUID in captured output", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);
      const { api_key, project_id } = await registerProject(app, "acme");

      await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });

      const allJson = JSON.stringify(lines());
      expect(allJson).not.toContain(project_id);
      expect(allJson).toContain(maskProjectId(project_id));
    });
  });

  describe("AC-3 — result_count", () => {
    it("omits result_count for non-list tools", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);
      const { api_key } = await registerProject(app, "acme");

      await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });

      const line = lines().find((l) => l.tool === "whoami");
      expect(line).toBeDefined();
      expect("result_count" in line!).toBe(false);
    });
  });

  describe("AC-4 — LOG_LEVEL filtering", () => {
    it("suppresses info lines when LOG_LEVEL=warn", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("warn");
      const app = buildTestApp(pool, db, capLogger);
      const { api_key } = await registerProject(app, "acme");

      await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });

      expect(lines().length).toBe(0);
    });

    it("shows error lines when LOG_LEVEL=warn and a tool throws", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("warn");
      const app = buildTestApp(pool, db, capLogger);
      const requireAuth = createRequireProjectAuth(pool, db as any);

      // Register throwing route BEFORE any inject call
      app.get(
        "/mcp/throw",
        { preHandler: [requireAuth] },
        withMcpRouteLogging("throw", async () => {
          throw new Error("deliberate");
        })
      );

      const { api_key } = await registerProject(app, "acme");

      const res = await app.inject({
        method: "GET",
        url: "/mcp/throw",
        headers: { authorization: `Bearer ${api_key}` },
      });
      expect(res.statusCode).toBe(500);

      const errorLines = lines().filter((l) => l.level === "error" || l.tool === "throw");
      expect(errorLines.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("AC-5 — error envelope and stack gating", () => {
    it("includes stack at debug level", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("debug");
      const app = buildTestApp(pool, db, capLogger);
      const requireAuth = createRequireProjectAuth(pool, db as any);

      // Register throwing route BEFORE any inject call
      app.get(
        "/mcp/throw-debug",
        { preHandler: [requireAuth] },
        withMcpRouteLogging("throw-debug", async () => {
          throw new Error("debug-throw");
        })
      );

      const { api_key } = await registerProject(app, "acme");

      const res = await app.inject({
        method: "GET",
        url: "/mcp/throw-debug",
        headers: { authorization: `Bearer ${api_key}` },
      });
      expect(res.statusCode).toBe(500);

      const toolLine = lines().find((l) => l.tool === "throw-debug");
      expect(toolLine).toBeDefined();
      expect("stack" in toolLine!).toBe(true);
      expect(typeof toolLine!.stack).toBe("string");
      expect((toolLine!.stack as string).length).toBeGreaterThan(0);
    });

    it("excludes stack at info level", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);
      const requireAuth = createRequireProjectAuth(pool, db as any);

      // Register throwing route BEFORE any inject call
      app.get(
        "/mcp/throw-info",
        { preHandler: [requireAuth] },
        withMcpRouteLogging("throw-info", async () => {
          throw new Error("info-throw");
        })
      );

      const { api_key } = await registerProject(app, "acme");

      const res = await app.inject({
        method: "GET",
        url: "/mcp/throw-info",
        headers: { authorization: `Bearer ${api_key}` },
      });
      expect(res.statusCode).toBe(500);

      const toolLine = lines().find((l) => l.tool === "throw-info");
      expect(toolLine).toBeDefined();
      expect("stack" in toolLine!).toBe(false);
      expect(toolLine!.error_code).toBe("UNEXPECTED");
      expect(toolLine!.retryable).toBe(false);
    });
  });

  describe("AC-6 — secret redaction", () => {
    it("redacts Authorization header value from logs", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);

      await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer lore_acme_aaaaaaaaaaaaaaaaaaaaaaaa" },
      });

      const allJson = JSON.stringify(lines());
      expect(allJson).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaa");
    });

    it("redacts api_key body field from logs", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);

      await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: { name: "Acme", slug: "acme", api_key: "lore_test_xxxxxxxxxxxxxxxxxxxxxxxx" },
      });

      const allJson = JSON.stringify(lines());
      expect(allJson).not.toContain("xxxxxxxxxxxxxxxxxxxxxxxx");
    });
  });

  describe("AC-7 — REST + auth surfaces", () => {
    it("logs REST route envelope for successful project registration", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": ADMIN_SECRET,
          "content-type": "application/json",
        },
        payload: { name: "Acme", slug: "acme" },
      });
      expect(res.statusCode).toBe(201);

      const restLine = lines().find(
        (l) => l.tool === "rest:POST:/api/projects/register"
      );
      expect(restLine).toBeDefined();
      expect(restLine!.project_id).toBe("-");
      expect(restLine!.success).toBe(true);
      expect(restLine!.status_code).toBe(201);
      expect("result_count" in restLine!).toBe(false);
    });

    it("logs auth:bearer envelope on missing header", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);

      const res = await app.inject({ method: "GET", url: "/mcp/whoami" });
      expect(res.statusCode).toBe(401);

      const authLine = lines().find((l) => l.tool === "auth:bearer");
      expect(authLine).toBeDefined();
      expect(authLine!.level).toBe("warn");
      expect(authLine!.success).toBe(false);
      expect(authLine!.reason).toBe("missing_header");
      expect(authLine!.ip).toMatch(/\.(0|::)$/);
    });

    it("logs auth:admin envelope on wrong admin secret", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);

      const res = await app.inject({
        method: "POST",
        url: "/api/projects/register",
        headers: {
          "x-admin-secret": "wrong",
          "content-type": "application/json",
        },
        payload: { name: "Acme", slug: "acme" },
      });
      expect(res.statusCode).toBe(401);

      const adminLine = lines().find((l) => l.tool === "auth:admin");
      expect(adminLine).toBeDefined();
      expect(adminLine!.level).toBe("warn");
      expect(adminLine!.success).toBe(false);
      expect(adminLine!.reason).toBe("admin_secret_mismatch");
    });

    it("logs auth:rate_limit envelope when limit is exceeded", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);

      // 21 failures to trigger rate limit
      for (let i = 0; i < 21; i++) {
        await app.inject({
          method: "GET",
          url: "/mcp/whoami",
          headers: { authorization: "Bearer bad" },
        });
      }

      const rateLines = lines().filter((l) => l.tool === "auth:rate_limit");
      expect(rateLines.length).toBeGreaterThanOrEqual(1);
      const last = rateLines[rateLines.length - 1];
      expect(last.success).toBe(false);
      expect(last.reason).toBe("rate_limit_exceeded");
      expect(typeof last.failure_count).toBe("number");
    });
  });

  describe("AC-8 — stdout only, no file", () => {
    it("emits valid one-line JSON per log entry", async () => {
      const { logger: capLogger, lines } = makeCapturedLogger("info");
      const app = buildTestApp(pool, db, capLogger);
      const { api_key } = await registerProject(app, "acme");

      await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });

      for (const line of lines()) {
        expect(line).toBeInstanceOf(Object);
        expect("level" in line).toBe(true);
      }
    });
  });
});
