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
import { clearFailures } from "../../src/api/middleware/rate-limit.js";

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

const registerProject = async (app: any, slug: string) => {
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
};

const insertLesson = async (
  pool: Pool,
  values: {
    projectId: string | null;
    title: string;
    problem?: string;
    fix?: string;
    preventionRule?: string;
    stackTags?: string[];
    category?: string | null;
    severity?: string;
    occurrenceCount?: number;
  }
) => {
  await pool.query(
    `INSERT INTO lessons (
       project_id, title, problem, fix, prevention_rule, stack_tags,
       category, severity, occurrence_count
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      values.projectId,
      values.title,
      values.problem ?? `${values.title} problem`,
      values.fix ?? `${values.title} fix`,
      values.preventionRule ?? `${values.title} rule`,
      values.stackTags ?? [],
      values.category ?? null,
      values.severity ?? "medium",
      values.occurrenceCount ?? 1,
    ]
  );
};

describe("DELETE /api/lessons/:id", () => {
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
    clearFailures();
  });

  it("returns 401 without admin secret", async () => {
    const app = buildTestApp(appPool, db);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/lessons/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 and removes the row on valid delete", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Delete me",
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/lessons/search",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const { lessons } = JSON.parse(listRes.payload);
    const id = lessons[0].id;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/lessons/${id}`,
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    expect(deleteRes.statusCode).toBe(200);
    const body = JSON.parse(deleteRes.payload);
    expect(body.deleted_id).toBe(id);

    const followUpRes = await app.inject({
      method: "GET",
      url: "/api/lessons/search",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const followUpBody = JSON.parse(followUpRes.payload);
    expect(followUpBody.lessons).toHaveLength(0);
  });

  it("returns 404 when deleting the same ID a second time", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Delete me",
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/lessons/search",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const { lessons } = JSON.parse(listRes.payload);
    const id = lessons[0].id;

    const firstDeleteRes = await app.inject({
      method: "DELETE",
      url: `/api/lessons/${id}`,
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    expect(firstDeleteRes.statusCode).toBe(200);

    const secondDeleteRes = await app.inject({
      method: "DELETE",
      url: `/api/lessons/${id}`,
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    expect(secondDeleteRes.statusCode).toBe(404);
    const body = JSON.parse(secondDeleteRes.payload);
    expect(body.error).toBe("not_found");
  });

  it("returns 404 for unknown uuid", async () => {
    const app = buildTestApp(appPool, db);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/lessons/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("not_found");
  });

  it("returns 400 for non-uuid id", async () => {
    const app = buildTestApp(appPool, db);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/lessons/not-a-uuid",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 for non-admin credentials", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Project lesson",
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/lessons/search",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const { lessons } = JSON.parse(listRes.payload);
    const lessonId = lessons[0].id;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/lessons/${lessonId}`,
      headers: { authorization: `Bearer invalid_key` },
    });
    expect(deleteRes.statusCode).toBe(401);
  });
});
