import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import { clearFailures } from "../../src/api/middleware/rate-limit.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

describe("Auth Rate Limiting — Security", () => {
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

  describe("AC-4 — 20 failed attempts per IP per minute → 429", () => {
    it("returns 401 for attempts 1–20 and 429 for attempt 21", async () => {
      const app = buildTestApp(pool, db);

      for (let i = 0; i < 20; i++) {
        const res = await app.inject({
          method: "GET",
          url: "/mcp/whoami",
          headers: { authorization: "Bearer bad_token" },
        });
        expect(res.statusCode).toBe(401);
      }

      const res21 = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer bad_token" },
      });
      expect(res21.statusCode).toBe(429);
      expect(JSON.parse(res21.payload).error).toBe("rate_limited");
      expect(res21.headers["retry-after"]).toBeDefined();
    });

    it("resets the counter after the 60-second window", async () => {
      const app = buildTestApp(pool, db);

      // Hit the limit
      for (let i = 0; i < 20; i++) {
        await app.inject({
          method: "GET",
          url: "/mcp/whoami",
          headers: { authorization: "Bearer bad_token" },
        });
      }

      const blocked = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer bad_token" },
      });
      expect(blocked.statusCode).toBe(429);

      // Manually clear failures to simulate window expiry
      clearFailures();

      const afterWindow = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer bad_token" },
      });
      expect(afterWindow.statusCode).toBe(401);
    });

    it("does not rate-limit successful auths", async () => {
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

    it("counts admin-auth failures toward the same limit", async () => {
      const app = buildTestApp(pool, db);

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

    it("is per-IP: one IP hitting the limit does not block another", async () => {
      const app = buildTestApp(pool, db);

      // IP-A fails 20 times
      for (let i = 0; i < 20; i++) {
        await app.inject({
          method: "GET",
          url: "/mcp/whoami",
          headers: {
            authorization: "Bearer bad_token_a",
            "x-forwarded-for": "1.2.3.4",
          },
        });
      }

      // IP-A is blocked
      const blockedA = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: {
          authorization: "Bearer bad_token_a",
          "x-forwarded-for": "1.2.3.4",
        },
      });
      expect(blockedA.statusCode).toBe(429);

      // IP-B should still get 401 (not 429)
      const ipB = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: {
          authorization: "Bearer bad_token_b",
          "x-forwarded-for": "5.6.7.8",
        },
      });
      expect(ipB.statusCode).toBe(401);
    });
  });

  describe("AC-3 — Auth uses bcrypt.compare", () => {
    it("authenticates a valid key and rejects an invalid one", async () => {
      const app = buildTestApp(pool, db);
      const { api_key, project_id } = await registerProject(app, "acme");

      const valid = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: `Bearer ${api_key}` },
      });
      expect(valid.statusCode).toBe(200);
      expect(JSON.parse(valid.payload).project_id).toBe(project_id);

      const invalid = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: { authorization: "Bearer lore_acme_000000000000000000000000" },
      });
      expect(invalid.statusCode).toBe(401);
    });

    it("returns identical 401 responses for all failure cases (no information leak)", async () => {
      const app = buildTestApp(pool, db);

      const r1 = await app.inject({ method: "GET", url: "/mcp/whoami" });
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
      const r4 = await app.inject({
        method: "GET",
        url: "/mcp/whoami",
        headers: {
          authorization: "Bearer lore_nonexistent_123456789012345678901234",
        },
      });

      expect(r1.statusCode).toBe(401);
      expect(r1.payload).toBe(r2.payload);
      expect(r2.payload).toBe(r3.payload);
      expect(r3.payload).toBe(r4.payload);
    });
  });
});
