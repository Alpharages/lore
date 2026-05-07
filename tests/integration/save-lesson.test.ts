import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

async function registerProject(app: any, slug: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/projects/register",
    headers: {
      "x-admin-secret": ADMIN_SECRET,
      "content-type": "application/json",
    },
    payload: { name: slug, slug, repos: [{ slug: "backend" }] },
  });
  return JSON.parse(res.payload);
}

describe("POST /mcp/tools/save_lesson", () => {
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
  });

  it("creates a lesson and returns 201 with pending embedding status", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "Drizzle RLS GUC reset on pool reconnect",
        problem: "Pool connection reuse clears GUC",
        fix: "Always set GUC in same transaction as query",
        prevention_rule: "Set app.current_project_id in every transaction before first query",
        stack_tags: ["typescript", "drizzle-orm", "postgres"],
        severity: "high",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.lesson_id).toBeDefined();
    expect(body.embedding_status).toBe("pending");
    expect(body.action).toBe("created");

    const row = await pool.query(
      `SELECT embedding_status, provenance->>'trust_tier' AS trust_tier
       FROM lessons WHERE id = $1`,
      [body.lesson_id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].embedding_status).toBe("pending");
    expect(row.rows[0].trust_tier).toBe("manual");
  });

  it("rejects missing required fields with 400", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        problem: "Something",
        fix: "Fix it",
        prevention_rule: "Don't do it",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("rejects invalid severity with 400", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        severity: "critical-plus",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("rejects unknown repo_slug with 400", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        repo_slug: "unknown-repo",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("resolves repo_slug to repo_id when valid", async () => {
    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        repo_slug: "backend",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);

    const row = await pool.query(`SELECT repo_id FROM lessons WHERE id = $1`, [body.lesson_id]);
    expect(row.rows[0].repo_id).not.toBeNull();

    const repoRow = await pool.query(
      `SELECT id FROM repositories WHERE project_id = $1 AND slug = $2`,
      [project_id, "backend"]
    );
    expect(row.rows[0].repo_id).toBe(repoRow.rows[0].id);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp(pool, db);

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: { "content-type": "application/json" },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("ignores caller-supplied provenance and uses server-stamped value", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "T",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
        provenance: { trust_tier: "high", source: "auto" },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);

    const row = await pool.query(
      `SELECT provenance->>'trust_tier' AS trust_tier, provenance->>'source' AS source
       FROM lessons WHERE id = $1`,
      [body.lesson_id]
    );
    expect(row.rows[0].trust_tier).toBe("manual");
    expect(row.rows[0].source).toBe("manual");
  });
});
