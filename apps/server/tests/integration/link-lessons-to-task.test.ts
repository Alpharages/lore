import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import {
  createTestPool,
  createTestDb,
  buildTestApp,
  resetDatabase,
  forceRowLevelSecurity,
  createAppRole,
} from "./helper.js";

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

async function insertSession(
  pool: Pool,
  values: {
    projectId: string;
    externalTaskId: string;
    lessonsConsulted?: string[];
    lessonsApplied?: string[];
    endedAt?: string | null;
  }
) {
  await pool.query(
    `INSERT INTO sessions (
       project_id, external_task_id, external_tracker_type,
       lessons_consulted, lessons_applied, ended_at
     )
     VALUES ($1, $2, 'clickup', $3, $4, $5)`,
    [
      values.projectId,
      values.externalTaskId,
      values.lessonsConsulted ?? [],
      values.lessonsApplied ?? [],
      values.endedAt ?? null,
    ]
  );
}

async function linkLessonsToTask(app: any, apiKey: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/mcp/tools/link_lessons_to_task",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    payload,
  });
}

describe("POST /mcp/tools/link_lessons_to_task", () => {
  let adminPool: Pool;
  let appPool: Pool;
  let db: ReturnType<typeof createTestDb>;

  beforeAll(async () => {
    adminPool = createTestPool();
    db = createTestDb(adminPool);
    await forceRowLevelSecurity(adminPool);
    const appUrl = await createAppRole(adminPool);
    appPool = new Pool({ connectionString: appUrl });
    const originalConnect = appPool.connect.bind(appPool);
    appPool.connect = (async () => {
      const client = await originalConnect();
      await client.query("SET ROLE lore_app");
      return client;
    }) as Pool["connect"];
  });

  afterAll(async () => {
    await appPool?.end();
    await adminPool?.end();
  });

  beforeEach(async () => {
    await resetDatabase(adminPool);
  });

  it("AC1 — happy path: consulted + applied merged into open session", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");
    const uuid1 = "11111111-1111-1111-1111-111111111111";
    const uuid2 = "22222222-2222-2222-2222-222222222222";

    await insertSession(adminPool, { projectId: project_id, externalTaskId: "task-123" });

    const res = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-123",
      consulted: [uuid1],
      applied: [uuid2],
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toEqual({ linked: 2 });

    const row = await adminPool.query(
      `SELECT lessons_consulted, lessons_applied FROM sessions WHERE external_task_id = 'task-123'`
    );
    expect(row.rows[0].lessons_consulted).toContain(uuid1);
    expect(row.rows[0].lessons_applied).toContain(uuid2);
  });

  it("AC2 — idempotency: calling twice with same IDs does not duplicate", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");
    const uuid1 = "11111111-1111-1111-1111-111111111111";
    const uuid2 = "22222222-2222-2222-2222-222222222222";

    await insertSession(adminPool, { projectId: project_id, externalTaskId: "task-123" });

    const first = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-123",
      consulted: [uuid1],
      applied: [uuid2],
    });
    expect(first.statusCode).toBe(200);
    expect(JSON.parse(first.payload)).toEqual({ linked: 2 });

    const second = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-123",
      consulted: [uuid1],
      applied: [uuid2],
    });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.payload)).toEqual({ linked: 2 });

    const row = await adminPool.query(
      `SELECT array_length(lessons_consulted, 1) AS consulted_len,
              array_length(lessons_applied, 1) AS applied_len
       FROM sessions WHERE external_task_id = 'task-123'`
    );
    expect(row.rows[0].consulted_len).toBe(1);
    expect(row.rows[0].applied_len).toBe(1);
  });

  it("AC3 — no open session: graceful no-op", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-999",
      consulted: ["11111111-1111-1111-1111-111111111111"],
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ linked: 0 });
  });

  it("AC4 — empty arrays: no-op returns linked:0", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertSession(adminPool, { projectId: project_id, externalTaskId: "task-123" });

    const res = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-123",
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ linked: 0 });
  });

  it("AC5 — incremental accumulation: second call adds new IDs", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");
    const uuid1 = "11111111-1111-1111-1111-111111111111";
    const uuid2 = "22222222-2222-2222-2222-222222222222";

    await insertSession(adminPool, {
      projectId: project_id,
      externalTaskId: "task-123",
      lessonsConsulted: [uuid1],
    });

    const res = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-123",
      consulted: [uuid2],
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ linked: 1 });

    const row = await adminPool.query(
      `SELECT lessons_consulted FROM sessions WHERE external_task_id = 'task-123'`
    );
    expect(row.rows[0].lessons_consulted).toContain(uuid1);
    expect(row.rows[0].lessons_consulted).toContain(uuid2);
  });

  it("AC6 — RLS isolation: cannot link into another project's session", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key: apiKeyA, project_id: projectIdA } = await registerProject(app, "project-a");
    const { api_key: apiKeyB } = await registerProject(app, "project-b");
    const uuid1 = "11111111-1111-1111-1111-111111111111";

    await insertSession(adminPool, { projectId: projectIdA, externalTaskId: "task-123" });

    const res = await linkLessonsToTask(app, apiKeyB, {
      external_task_id: "task-123",
      consulted: [uuid1],
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ linked: 0 });
  });

  it("AC7 — auth required: no Authorization header → 401", async () => {
    const app = buildTestApp(appPool, db);
    await registerProject(app, "acme");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/link_lessons_to_task",
      headers: { "content-type": "application/json" },
      payload: { external_task_id: "task-123", consulted: [] },
    });

    expect(res.statusCode).toBe(401);
  });

  it("AC8 — invalid UUID rejected by schema: consulted: ['not-a-uuid'] → 400", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-123",
      consulted: ["not-a-uuid"],
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error).toBe("validation_error");
  });

  it("picks the most recent open session when multiple exist for the same task", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");
    const uuid1 = "11111111-1111-1111-1111-111111111111";

    await insertSession(adminPool, {
      projectId: project_id,
      externalTaskId: "task-multi",
      endedAt: new Date(Date.now() - 3600_000).toISOString(),
    });
    await insertSession(adminPool, {
      projectId: project_id,
      externalTaskId: "task-multi",
    });

    const res = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-multi",
      consulted: [uuid1],
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ linked: 1 });

    const rows = await adminPool.query(
      `SELECT id, lessons_consulted, ended_at FROM sessions WHERE external_task_id = 'task-multi' ORDER BY started_at DESC`
    );
    expect(rows.rows[0].lessons_consulted).toContain(uuid1);
    expect(rows.rows[1].lessons_consulted).toEqual([]);
  });

  it("deduplicates overlapping UUIDs across consulted and applied", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");
    const uuid1 = "11111111-1111-1111-1111-111111111111";

    await insertSession(adminPool, { projectId: project_id, externalTaskId: "task-123" });

    const res = await linkLessonsToTask(app, api_key, {
      external_task_id: "task-123",
      consulted: [uuid1],
      applied: [uuid1],
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ linked: 1 });
  });
});
