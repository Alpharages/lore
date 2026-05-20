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

const insertPattern = async (
  pool: Pool,
  values: {
    projectId: string | null;
    title: string;
    description?: string;
    stackTags?: string[];
    category?: string | null;
    usageCount?: number;
    lastUsedAt?: string;
    codeExample?: string;
    externalTaskRef?: string;
    externalTrackerType?: string;
  }
) => {
  await pool.query(
    `INSERT INTO patterns (
       project_id, title, description, stack_tags, category,
       usage_count, last_used_at, code_example, external_task_ref, external_tracker_type
     )
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8, $9, $10)`,
    [
      values.projectId,
      values.title,
      values.description ?? `${values.title} description`,
      values.stackTags ?? [],
      values.category ?? null,
      values.usageCount ?? 1,
      values.lastUsedAt ?? null,
      values.codeExample ?? null,
      values.externalTaskRef ?? null,
      values.externalTrackerType ?? null,
    ]
  );
};

describe("DELETE /api/patterns/:id", () => {
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
      url: "/api/patterns/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 and removes the row on valid delete", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Delete me",
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/patterns",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const { patterns } = JSON.parse(listRes.payload);
    const id = patterns[0].id;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/patterns/${id}`,
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    expect(deleteRes.statusCode).toBe(200);
    const body = JSON.parse(deleteRes.payload);
    expect(body.deleted_id).toBe(id);

    const followUpRes = await app.inject({
      method: "GET",
      url: "/api/patterns",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    const followUpBody = JSON.parse(followUpRes.payload);
    expect(followUpBody.patterns).toHaveLength(0);
  });

  it("returns 404 for unknown uuid", async () => {
    const app = buildTestApp(appPool, db);
    const res = await app.inject({
      method: "DELETE",
      url: "/api/patterns/00000000-0000-0000-0000-000000000000",
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
      url: "/api/patterns/not-a-uuid",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
