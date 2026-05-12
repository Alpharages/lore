import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";

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
  });

  it("returns healthy status when DB is up", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");

    const body = JSON.parse(response.payload);
    expect(Object.keys(body).sort()).toEqual(["db", "status"]);
    expect(body.status).toBe("healthy");
    expect(body.db).toBe("connected");
  });

  it("returns degraded when DB is disconnected", async () => {
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
