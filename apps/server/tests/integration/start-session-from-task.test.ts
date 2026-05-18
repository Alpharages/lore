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

describe("POST /mcp/tools/start_session_from_task", () => {
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

  it("creates a new session when none exists", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
        branch: "feat/2.6",
        bmad_skill: "clickup-dev-implement",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.resumed).toBe(false);
    expect(body.session_id).toBeDefined();
    expect(body.prior_session_summary).toBeUndefined();

    const row = await pool.query(
      `SELECT external_task_id, external_tracker_type, bmad_skill, branch, ended_at
       FROM sessions WHERE id = $1`,
      [body.session_id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].external_task_id).toBe("task-abc");
    expect(row.rows[0].external_tracker_type).toBe("clickup");
    expect(row.rows[0].bmad_skill).toBe("clickup-dev-implement");
    expect(row.rows[0].branch).toBe("feat/2.6");
    expect(row.rows[0].ended_at).toBeNull();
  });

  it("resumes an open session when one exists", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const firstRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
        branch: "feat/2.6",
      },
    });
    const first = JSON.parse(firstRes.payload);
    expect(first.resumed).toBe(false);

    const secondRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
        branch: "feat/2.7",
      },
    });

    expect(secondRes.statusCode).toBe(200);
    const second = JSON.parse(secondRes.payload);
    expect(second.resumed).toBe(true);
    expect(second.session_id).toBe(first.session_id);
    expect(second.prior_session_summary).toBeDefined();
    expect(second.prior_session_summary.branch).toBe("feat/2.6");
    expect(second.prior_session_summary.decisions).toEqual([]);
    expect(second.prior_session_summary.files_touched).toEqual([]);
    expect(second.prior_session_summary.started_at).not.toBeNull();
    expect(second.prior_session_summary.ended_at).toBeNull();

    const count = await pool.query(
      `SELECT COUNT(*) FROM sessions WHERE external_task_id = 'task-abc' AND external_tracker_type = 'clickup'`
    );
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("does not resume a closed session", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const startRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
        branch: "feat/2.6",
      },
    });
    const first = JSON.parse(startRes.payload);

    await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { session_id: first.session_id },
    });

    const secondRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
        branch: "feat/2.7",
      },
    });

    expect(secondRes.statusCode).toBe(200);
    const second = JSON.parse(secondRes.payload);
    expect(second.resumed).toBe(false);
    expect(second.session_id).not.toBe(first.session_id);
  });

  it("returns 400 for unknown repo_slug", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
        repo_slug: "nonexistent-repo",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
    expect(body.message).toContain("nonexistent-repo");
  });

  it("rejects invalid external_tracker_type by schema", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "github",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("isolates sessions by project (RLS)", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: apiKeyA, project_id: projectIdA } = await registerProject(app, "project-a");
    const { api_key: apiKeyB } = await registerProject(app, "project-b");

    const resA = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${apiKeyA}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
        branch: "feat/a",
      },
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.payload);
    expect(bodyA.resumed).toBe(false);

    const resB = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${apiKeyB}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
        branch: "feat/b",
      },
    });
    expect(resB.statusCode).toBe(200);
    const bodyB = JSON.parse(resB.payload);
    expect(bodyB.resumed).toBe(false);
    expect(bodyB.session_id).not.toBe(bodyA.session_id);

    const rowA = await pool.query(`SELECT project_id FROM sessions WHERE id = $1`, [
      bodyA.session_id,
    ]);
    const rowB = await pool.query(`SELECT project_id FROM sessions WHERE id = $1`, [
      bodyB.session_id,
    ]);
    expect(rowA.rows[0].project_id).toBe(projectIdA);
    expect(rowB.rows[0].project_id).not.toBe(projectIdA);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = buildTestApp(pool, db);

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: { "content-type": "application/json" },
      payload: {
        external_task_id: "task-abc",
        external_tracker_type: "clickup",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("creates a session with all optional fields", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-xyz",
        external_tracker_type: "jira",
        external_task_ref: "JIRA-123",
        task_summary: "Fix auth bug",
        branch: "fix/auth",
        user_handle: "alice",
        bmad_skill: "clickup-dev-implement",
        bmad_workflow: "bmad-dev-story",
        repo_slug: "testrepo",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.resumed).toBe(false);
    expect(body.session_id).toBeDefined();

    const row = await pool.query(
      `SELECT external_task_id, external_tracker_type, external_task_ref, task_summary, branch, user_handle, bmad_skill, bmad_workflow, repo_id
       FROM sessions WHERE id = $1`,
      [body.session_id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].external_task_id).toBe("task-xyz");
    expect(row.rows[0].external_tracker_type).toBe("jira");
    expect(row.rows[0].external_task_ref).toBe("JIRA-123");
    expect(row.rows[0].task_summary).toBe("Fix auth bug");
    expect(row.rows[0].branch).toBe("fix/auth");
    expect(row.rows[0].user_handle).toBe("alice");
    expect(row.rows[0].bmad_skill).toBe("clickup-dev-implement");
    expect(row.rows[0].bmad_workflow).toBe("bmad-dev-story");
    expect(row.rows[0].repo_id).not.toBeNull();
  });

  it("resumes the most recent open session when multiple exist", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const olderRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-multi",
        external_tracker_type: "clickup",
        branch: "older",
      },
    });
    const older = JSON.parse(olderRes.payload);

    await app.inject({
      method: "POST",
      url: "/mcp/tools/end_session",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: { session_id: older.session_id },
    });

    const newerRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-multi",
        external_tracker_type: "clickup",
        branch: "newer",
      },
    });
    const newer = JSON.parse(newerRes.payload);
    expect(newer.resumed).toBe(false);

    const resumeRes = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-multi",
        external_tracker_type: "clickup",
        branch: "latest",
      },
    });

    expect(resumeRes.statusCode).toBe(200);
    const resume = JSON.parse(resumeRes.payload);
    expect(resume.resumed).toBe(true);
    expect(resume.session_id).toBe(newer.session_id);
    expect(resume.prior_session_summary.branch).toBe("newer");
  });

  it("returns 400 when external_task_id is missing", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_tracker_type: "clickup",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when external_task_id is only whitespace", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "   ",
        external_tracker_type: "clickup",
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
    expect(body.message).toContain("external_task_id");
  });

  it("returns 400 when external_tracker_type is missing", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/start_session_from_task",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-abc",
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
