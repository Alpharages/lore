import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp } from "./helper.js";

describe("S2 — app-level security headers", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;
  let app: ReturnType<typeof buildTestApp>;

  beforeAll(() => {
    pool = createTestPool();
    db = createTestDb(pool);
    app = buildTestApp(pool, db);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("sets helmet hardening headers on normal API responses", async () => {
    const response = await app.inject({ method: "GET", url: "/api/projects" });

    // Standard helmet defaults — fail loudly if helmet is unregistered.
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBeDefined();
    expect(response.headers["x-dns-prefetch-control"]).toBeDefined();
    expect(response.headers["referrer-policy"]).toBeDefined();
  });

  it("attaches a Content-Security-Policy on non-probe routes", async () => {
    const response = await app.inject({ method: "GET", url: "/api/projects" });
    expect(response.headers["content-security-policy"]).toBeDefined();
  });

  it("omits Content-Security-Policy on /health (probe endpoint)", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.headers["content-security-policy"]).toBeUndefined();
  });

  it("omits Content-Security-Policy on /metrics (probe endpoint)", async () => {
    const response = await app.inject({ method: "GET", url: "/metrics" });
    // /metrics is admin-protected; we don't care about the status, only that
    // helmet did not attach a CSP for the probe.
    expect(response.headers["content-security-policy"]).toBeUndefined();
  });
});

describe("S2 — CORS configuration", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;

  beforeAll(() => {
    pool = createTestPool();
    db = createTestDb(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects cross-origin requests when WEB_UI_ORIGIN is unset", async () => {
    const prev = process.env.WEB_UI_ORIGIN;
    delete process.env.WEB_UI_ORIGIN;
    const app = buildTestApp(pool, db);
    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/projects",
        headers: {
          origin: "https://evil.example.com",
          "access-control-request-method": "GET",
        },
      });
      // With CORS disabled, no Access-Control-Allow-Origin should be returned.
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
      if (prev === undefined) delete process.env.WEB_UI_ORIGIN;
      else process.env.WEB_UI_ORIGIN = prev;
    }
  });

  it("allows requests from configured WEB_UI_ORIGIN", async () => {
    const prev = process.env.WEB_UI_ORIGIN;
    process.env.WEB_UI_ORIGIN = "http://localhost:3001";
    const app = buildTestApp(pool, db);
    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/projects",
        headers: {
          origin: "http://localhost:3001",
          "access-control-request-method": "GET",
        },
      });
      expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3001");
    } finally {
      await app.close();
      if (prev === undefined) delete process.env.WEB_UI_ORIGIN;
      else process.env.WEB_UI_ORIGIN = prev;
    }
  });

  it("rejects requests from origins not in WEB_UI_ORIGIN", async () => {
    const prev = process.env.WEB_UI_ORIGIN;
    process.env.WEB_UI_ORIGIN = "http://localhost:3001";
    const app = buildTestApp(pool, db);
    try {
      const response = await app.inject({
        method: "OPTIONS",
        url: "/api/projects",
        headers: {
          origin: "https://evil.example.com",
          "access-control-request-method": "GET",
        },
      });
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
      if (prev === undefined) delete process.env.WEB_UI_ORIGIN;
      else process.env.WEB_UI_ORIGIN = prev;
    }
  });
});
