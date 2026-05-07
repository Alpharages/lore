import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import { _resetOpenAIStatusCache } from "../../src/services/health-probes.js";

describe("GET /health", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof buildTestApp>;

  beforeAll(() => {
    pool = createTestPool();
    db = createTestDb(pool);
    app = buildTestApp(pool, db);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await resetDatabase(pool);
    _resetOpenAIStatusCache();
  });

  it("returns the exact §8.2 shape with healthy status when DB is up and OpenAI is unknown", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");

    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("db");
    expect(body).toHaveProperty("db_lessons_count");
    expect(body).toHaveProperty("db_projects_count");
    expect(body).toHaveProperty("openai");
    expect(body).toHaveProperty("uptime_seconds");
    expect(Object.keys(body).sort()).toEqual(
      ["status", "db", "db_lessons_count", "db_projects_count", "openai", "uptime_seconds"].sort()
    );

    expect(body.status).toBe("healthy");
    expect(body.db).toBe("connected");
    expect(body.openai).toBe("unknown");
    expect(typeof body.db_lessons_count).toBe("number");
    expect(typeof body.db_projects_count).toBe("number");
    expect(typeof body.uptime_seconds).toBe("number");
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  it("returns degraded when OpenAI is unreachable", async () => {
    // Simulate unreachable by setting OPENAI_API_KEY to a dummy value
    // and letting the probe fail. We'll mock the fetch behavior by
    // temporarily breaking the key.
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "invalid-key-for-testing";
    _resetOpenAIStatusCache();

    try {
      // First call primes the cache as unreachable
      await app.inject({ method: "GET", url: "/health" });

      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      const body = JSON.parse(response.payload);
      expect(body.status).toBe("degraded");
      expect(body.openai).toBe("unreachable");
      expect(body.db).toBe("connected");
      expect(response.statusCode).toBe(200);
    } finally {
      process.env.OPENAI_API_KEY = originalKey;
      _resetOpenAIStatusCache();
    }
  });

  it("returns degraded when DB is disconnected", async () => {
    // Create an app with a broken pool
    const brokenPool = new Pool({
      connectionString: "postgres://invalid:invalid@localhost:1/lore_memory",
    });
    const brokenDb = createTestDb(brokenPool);
    const brokenApp = buildTestApp(brokenPool, brokenDb);

    try {
      const response = await brokenApp.inject({
        method: "GET",
        url: "/health",
      });

      const body = JSON.parse(response.payload);
      expect(body.status).toBe("degraded");
      expect(body.db).toBe("disconnected");
      expect(response.statusCode).toBe(200);
    } finally {
      await brokenPool.end();
    }
  });
});
