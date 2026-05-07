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

describe("POST /mcp/tools/increment_occurrence", () => {
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

  it("increments occurrence_count and returns new_count", async () => {
    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    const lessonId = "11111111-1111-1111-1111-111111111111";
    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, occurrence_count)
       VALUES ($1, $2, 'T', 'P', 'F', 'R', 3)`,
      [lessonId, project_id]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/increment_occurrence",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { lesson_id: lessonId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lesson_id).toBe(lessonId);
    expect(body.new_count).toBe(4);

    const row = await pool.query(
      `SELECT occurrence_count, last_seen_at FROM lessons WHERE id = $1`,
      [lessonId]
    );
    expect(row.rows[0].occurrence_count).toBe(4);
    expect(row.rows[0].last_seen_at).not.toBeNull();
  });

  it("appends user_handle to hit_by_users when provided", async () => {
    const app = buildTestApp(pool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    const lessonId = "11111111-1111-1111-1111-111111111111";
    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, occurrence_count, hit_by_users)
       VALUES ($1, $2, 'T', 'P', 'F', 'R', 1, '{}')`,
      [lessonId, project_id]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/increment_occurrence",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { lesson_id: lessonId, user_handle: "bob" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.new_count).toBe(2);

    const row = await pool.query(`SELECT hit_by_users FROM lessons WHERE id = $1`, [lessonId]);
    expect(row.rows[0].hit_by_users).toContain("bob");
  });

  it("returns 404 when lesson does not exist", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/increment_occurrence",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { lesson_id: "00000000-0000-0000-0000-000000000000" },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("LESSON_NOT_FOUND");
  });

  it("returns 400 when lesson_id is missing", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/increment_occurrence",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp(pool, db);

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/increment_occurrence",
      headers: { "content-type": "application/json" },
      payload: { lesson_id: "11111111-1111-1111-1111-111111111111" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("does not modify a lesson in another project (RLS)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: apiKeyA } = await registerProject(app, "project-a");
    const { project_id: projectIdB } = await registerProject(app, "project-b");

    const lessonId = "11111111-1111-1111-1111-111111111111";
    await pool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, occurrence_count)
       VALUES ($1, $2, 'T', 'P', 'F', 'R', 5)`,
      [lessonId, projectIdB]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/increment_occurrence",
      headers: {
        authorization: `Bearer ${apiKeyA}`,
        "content-type": "application/json",
      },
      payload: { lesson_id: lessonId },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("LESSON_NOT_FOUND");

    const row = await pool.query(`SELECT occurrence_count FROM lessons WHERE id = $1`, [lessonId]);
    expect(row.rows[0].occurrence_count).toBe(5);
  });
});
