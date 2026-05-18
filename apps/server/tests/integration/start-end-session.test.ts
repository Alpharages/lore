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
    payload: { name: slug, slug, repos: [{ slug: "testrepo" }] },
  });
  return JSON.parse(res.payload);
}

describe("POST /mcp/tools/start_session", () => {
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

  it("creates a session and returns 201 with session_id", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        repo_slug: "testrepo",
        branch: "feat/x",
        task_summary: "Implement feature X",
        user_handle: "alice",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.session_id).toBeDefined();
    expect(body.started_at).toBeDefined();

    const row = await pool.query(
      `SELECT repo_id, branch, task_summary, user_handle, ended_at, started_at
       FROM sessions WHERE id = $1`,
      [body.session_id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].branch).toBe("feat/x");
    expect(row.rows[0].task_summary).toBe("Implement feature X");
    expect(row.rows[0].user_handle).toBe("alice");
    expect(row.rows[0].ended_at).toBeNull();
    expect(new Date(body.started_at).getTime()).toBe(new Date(row.rows[0].started_at).getTime());
  });

  it("rejects unknown repo_slug with 404", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        repo_slug: "ghost-repo",
        branch: "main",
      },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("repository_not_found");
    expect(body.message).toContain("ghost-repo");
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp(pool, db);

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: { "content-type": "application/json" },
      payload: { repo_slug: "testrepo", branch: "main" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("creates a session with required repo_slug and branch only", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        repo_slug: "testrepo",
        branch: "main",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.session_id).toBeDefined();

    const row = await pool.query(
      `SELECT branch, task_summary, user_handle, repo_id
       FROM sessions s
       JOIN repositories r ON r.id = s.repo_id
       WHERE s.id = $1`,
      [body.session_id]
    );
    expect(row.rows[0].branch).toBe("main");
    expect(row.rows[0].task_summary).toBeNull();
    expect(row.rows[0].user_handle).toBeNull();
    expect(row.rows[0].repo_id).not.toBeNull();
  });

  it("returns 400 when repo_slug is missing", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        branch: "main",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("isolates sessions by project (RLS)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: apiKeyA, project_id: projectIdA } = await registerProject(app, "project-a");
    const { api_key: apiKeyB, project_id: projectIdB } = await registerProject(app, "project-b");

    const resA = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${apiKeyA}`,
        "content-type": "application/json",
      },
      payload: { repo_slug: "testrepo", branch: "feat/a" },
    });

    const resB = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${apiKeyB}`,
        "content-type": "application/json",
      },
      payload: { repo_slug: "testrepo", branch: "feat/b" },
    });

    expect(resA.statusCode).toBe(201);
    expect(resB.statusCode).toBe(201);

    const bodyA = JSON.parse(resA.payload);
    const bodyB = JSON.parse(resB.payload);

    const rowA = await pool.query(`SELECT project_id FROM sessions WHERE id = $1`, [
      bodyA.session_id,
    ]);
    const rowB = await pool.query(`SELECT project_id FROM sessions WHERE id = $1`, [
      bodyB.session_id,
    ]);

    expect(rowA.rows[0].project_id).toBe(projectIdA);
    expect(rowB.rows[0].project_id).toBe(projectIdB);
  });
});

describe("POST /mcp/tools/end_session", () => {
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

  it("ends a session and returns 200 with ended=true", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const lessonRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "Test lesson",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
      },
    });
    const lesson = JSON.parse(lessonRes.payload);

    const startRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { repo_slug: "testrepo", branch: "feat/x" },
    });
    const { session_id } = JSON.parse(startRes.payload);

    const endRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        session_id,
        decisions: [{ what: "used drizzle", why: "ORM choice" }],
        lessons_applied: [lesson.lesson_id],
        files_touched: ["src/db/schema.ts"],
      },
    });

    expect(endRes.statusCode).toBe(200);
    const body = JSON.parse(endRes.payload);
    expect(body.session_id).toBe(session_id);
    expect(body.ended).toBe(true);
    expect(typeof body.duration_minutes).toBe("number");
    expect(body.duration_minutes).toBeGreaterThanOrEqual(0);

    const row = await pool.query(
      `SELECT ended_at, decisions, lessons_applied, files_touched
       FROM sessions WHERE id = $1`,
      [session_id]
    );
    expect(row.rows[0].ended_at).not.toBeNull();
    expect(row.rows[0].decisions).toHaveLength(1);
    expect(row.rows[0].lessons_applied).toContain(lesson.lesson_id);
    expect(row.rows[0].files_touched).toContain("src/db/schema.ts");
  });

  it("is idempotent: calling end_session twice returns ended=true without error", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const startRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { repo_slug: "testrepo", branch: "feat/x" },
    });
    const { session_id } = JSON.parse(startRes.payload);

    const endRes1 = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { session_id },
    });
    expect(endRes1.statusCode).toBe(200);
    const first = JSON.parse(endRes1.payload);
    expect(typeof first.duration_minutes).toBe("number");

    const endRes2 = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { session_id },
    });
    expect(endRes2.statusCode).toBe(200);
    const second = JSON.parse(endRes2.payload);
    expect(second.ended).toBe(true);
    expect(second.duration_minutes).toBe(first.duration_minutes);
  });

  it("returns 400 for a session from a different project", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: apiKeyA } = await registerProject(app, "project-a");
    const { api_key: apiKeyB } = await registerProject(app, "project-b");

    const startRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${apiKeyA}`,
        "content-type": "application/json",
      },
      payload: { repo_slug: "testrepo", branch: "feat/a" },
    });
    const { session_id } = JSON.parse(startRes.payload);

    const endRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${apiKeyB}`,
        "content-type": "application/json",
      },
      payload: { session_id },
    });

    expect(endRes.statusCode).toBe(400);
    const body = JSON.parse(endRes.payload);
    expect(body.error).toBe("validation_error");
  });

  it("returns 400 when session_id does not exist", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const endRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { session_id: "00000000-0000-0000-0000-000000000000" },
    });

    expect(endRes.statusCode).toBe(400);
    const body = JSON.parse(endRes.payload);
    expect(body.error).toBe("validation_error");
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp(pool, db);

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: { "content-type": "application/json" },
      payload: { session_id: "00000000-0000-0000-0000-000000000000" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid lesson UUIDs in lessons_applied", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const startRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { repo_slug: "testrepo", branch: "feat/x" },
    });
    const { session_id } = JSON.parse(startRes.payload);

    const endRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        session_id,
        lessons_applied: ["00000000-0000-0000-0000-000000000000"],
      },
    });

    expect(endRes.statusCode).toBe(400);
    const body = JSON.parse(endRes.payload);
    expect(body.error).toBe("validation_error");
  });

  it("accepts duplicate lesson UUIDs in lessons_applied", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const lessonRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/save_lesson",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        title: "Dup test",
        problem: "P",
        fix: "F",
        prevention_rule: "R",
      },
    });
    const lesson = JSON.parse(lessonRes.payload);

    const startRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { repo_slug: "testrepo", branch: "main" },
    });
    const { session_id } = JSON.parse(startRes.payload);

    const endRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        session_id,
        lessons_applied: [lesson.lesson_id, lesson.lesson_id],
      },
    });

    expect(endRes.statusCode).toBe(200);
    const row = await pool.query(`SELECT lessons_applied FROM sessions WHERE id = $1`, [
      session_id,
    ]);
    expect(row.rows[0].lessons_applied).toEqual([lesson.lesson_id]);
  });

  it("allows empty arrays for optional fields", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const startRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { repo_slug: "testrepo", branch: "feat/x" },
    });
    const { session_id } = JSON.parse(startRes.payload);

    const endRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        session_id,
        decisions: [],
        lessons_applied: [],
        files_touched: [],
      },
    });

    expect(endRes.statusCode).toBe(200);
    const body = JSON.parse(endRes.payload);
    expect(body.ended).toBe(true);
  });
});
