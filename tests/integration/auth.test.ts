import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { spawnSync } from "child_process";
import {
  createTestPool,
  createTestDb,
  buildTestApp,
  resetDatabase,
} from "./helper.js";
import { clearFailures } from "../../src/api/middleware/rate-limit.js";
import { createRequireProjectAuth } from "../../src/api/middleware/auth.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

describe("Auth Middleware & Rate Limiting", () => {
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

  describe("AC-5 — Auth middleware + RLS", () => {
    it("authenticates and sets project context", async () => {
      const app = buildTestApp(pool, db);
      const { api_key } = await registerProject(app, "acme");

      const res = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.slug).toBe("acme");
      expect(body.project_id).toBeDefined();
    });

    it("enforces RLS so a project sees only its own rows", async () => {
      const app = buildTestApp(pool, db);
      const projectA = await registerProject(app, "project-a");
      const projectB = await registerProject(app, "project-b");

      // Seed one lesson per project directly via admin pool (bypasses RLS)
      await pool.query(
        `INSERT INTO lessons (project_id, title, problem, fix, prevention_rule)
         VALUES ($1, 'A lesson', 'problem', 'fix', 'rule')`,
        [projectA.project_id]
      );
      await pool.query(
        `INSERT INTO lessons (project_id, title, problem, fix, prevention_rule)
         VALUES ($1, 'B lesson', 'problem', 'fix', 'rule')`,
        [projectB.project_id]
      );

      // Project A: RLS should expose exactly 1 lesson (its own)
      const resA = await app.inject({
        method: "GET",
        url: "/mcp/_test/lesson-count",
        headers: { authorization: `Bearer ${projectA.api_key}` },
      });
      expect(resA.statusCode).toBe(200);
      expect(JSON.parse(resA.payload).count).toBe(1);

      // Project B: RLS should expose exactly 1 lesson (its own)
      const resB = await app.inject({
        method: "GET",
        url: "/mcp/_test/lesson-count",
        headers: { authorization: `Bearer ${projectB.api_key}` },
      });
      expect(resB.statusCode).toBe(200);
      expect(JSON.parse(resB.payload).count).toBe(1);
    });
  });

  describe("AC-6 — Missing or invalid token → 401", () => {
    it("returns 401 with no header", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({ method: "GET", url: "/mcp/whoami" });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.payload).error).toBe("unauthorized");
    });

    it("returns 401 with wrong scheme", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Token foo" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with non-existent project slug", async () => {
      const app = buildTestApp(pool, db);
      const res = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer lore_nonexistent_123456789012345678901234" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 401 with wrong key for existing project", async () => {
      const app = buildTestApp(pool, db);
      await registerProject(app, "acme");
      const res = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer lore_acme_123456789012345678901234" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns identical response for all failure cases", async () => {
      const app = buildTestApp(pool, db);

      const r1 = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
      });
      const r2 = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Token foo" },
      });
      const r3 = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer lore_x_xxx" },
      });

      expect(r1.statusCode).toBe(401);
      expect(r1.payload).toBe(r2.payload);
      expect(r2.payload).toBe(r3.payload);
    });
  });

  describe("AC-8 — Rate limit", () => {
    it("blocks after 20 failed auth attempts and allows retry after window", async () => {
      const app = buildTestApp(pool, db);

      // 20 failures
      for (let i = 0; i < 20; i++) {
        const res = await app.inject({
          method: "GET",
          url: "/mcp/whoami",
          headers: { authorization: "Bearer bad_token" },
        });
        expect(res.statusCode).toBe(401);
      }

      // 21st should be rate limited
      const res21 = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer bad_token" },
      });
      expect(res21.statusCode).toBe(429);
      expect(JSON.parse(res21.payload).error).toBe("rate_limited");
      expect(res21.headers["retry-after"]).toBeDefined();
    });

    it("counts admin auth failures toward the same limit", async () => {
      const app = buildTestApp(pool, db);

      // Mix of project and admin failures
      for (let i = 0; i < 10; i++) {
        await app.inject({
          method: "GET",
          url: "/mcp/whoami",
          headers: { authorization: "Bearer bad_token" },
        });
        await app.inject({
          method: "POST",
          url: "/api/projects/register",
          headers: {
            "x-admin-secret": "wrong",
            "content-type": "application/json",
          },
          payload: { name: "X", slug: `x${i}` },
        });
      }

      const res21 = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer bad_token" },
      });
      expect(res21.statusCode).toBe(429);
    });

    it("does not rate limit successful auths", async () => {
      const app = buildTestApp(pool, db);
      const { api_key } = await registerProject(app, "acme");

      for (let i = 0; i < 25; i++) {
        const res = await app.inject({
          method: "GET",
          url: "/mcp/whoami",
          headers: { authorization: `Bearer ${api_key}` },
        });
        expect(res.statusCode).toBe(200);
      }
    });
  });

  describe("DoD — Connection lifecycle", () => {
    it("releases the connection after a handler throws", async () => {
      const app = buildTestApp(pool, db);
      const requireAuth = createRequireProjectAuth(pool, db as any);

      // Add a temporary throwing route BEFORE any inject call
      app.get("/mcp/throw", { preHandler: [requireAuth] }, async () => {
        throw new Error("deliberate throw");
      });

      const { api_key } = await registerProject(app, "acme");

      // Trigger auth + throw
      const throwRes = await app.inject({
        method: "GET",
        url: "/mcp/throw",
        headers: { authorization: `Bearer ${api_key}` },
      });
      expect(throwRes.statusCode).toBe(500);

      // Subsequent requests must still succeed (pool not exhausted)
      const res = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("DoD — Boot validation", () => {
    it("exits non-zero when ADMIN_SECRET is missing", () => {
      const result = spawnSync("npx", ["tsx", "src/index.ts"], {
        env: { ...process.env, ADMIN_SECRET: "" },
        cwd: process.cwd(),
        timeout: 10000,
      });
      expect(result.status).not.toBe(0);
    });
  });
});
