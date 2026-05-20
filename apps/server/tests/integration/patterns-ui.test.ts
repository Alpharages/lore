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

const getPatternsUi = async (app: any, query?: Record<string, string>) => {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  return app.inject({
    method: "GET",
    url: `/api/patterns${qs}`,
    headers: {
      authorization: `Bearer ${ADMIN_SECRET}`,
    },
  });
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

describe("GET /api/patterns", () => {
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
      method: "GET",
      url: "/api/patterns",
    });
    expect(res.statusCode).toBe(401);
  });

  it("filters by tags", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Fastify pattern",
      stackTags: ["fastify"],
    });
    await insertPattern(adminPool, {
      projectId: project_id,
      title: "NestJS pattern",
      stackTags: ["nestjs"],
    });

    const res = await getPatternsUi(app, { tags: "fastify" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].title).toBe("Fastify pattern");
  });

  it("filters by category", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Arch pattern",
      category: "architecture",
    });
    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Style pattern",
      category: "style",
    });

    const res = await getPatternsUi(app, { category: "architecture" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].title).toBe("Arch pattern");
  });

  it("filters by project slug and includes globals", async () => {
    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await insertPattern(adminPool, {
      projectId: projectA.project_id,
      title: "Project A pattern",
      stackTags: ["typescript"],
    });
    await insertPattern(adminPool, {
      projectId: projectB.project_id,
      title: "Project B pattern",
      stackTags: ["typescript"],
    });
    await insertPattern(adminPool, {
      projectId: null,
      title: "Global pattern",
      stackTags: ["typescript"],
    });

    const res = await getPatternsUi(app, { project: "project-a", tags: "typescript" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const titles = body.patterns.map((p: { title: string }) => p.title);
    expect(titles).toContain("Project A pattern");
    expect(titles).toContain("Global pattern");
    expect(titles).not.toContain("Project B pattern");
  });

  it("orders by usage_count DESC NULLS LAST, last_used_at DESC NULLS LAST", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Low usage",
      usageCount: 1,
      lastUsedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    });
    await insertPattern(adminPool, {
      projectId: project_id,
      title: "High usage",
      usageCount: 5,
      lastUsedAt: new Date().toISOString(),
    });
    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Medium usage",
      usageCount: 3,
      lastUsedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    });

    const res = await getPatternsUi(app);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns.map((p: { title: string }) => p.title)).toEqual([
      "High usage",
      "Medium usage",
      "Low usage",
    ]);
  });

  it("does NOT bump usage_count on read", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "No bump pattern",
      usageCount: 5,
    });

    const res1 = await getPatternsUi(app);
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.payload);
    expect(body1.patterns[0].usageCount).toBe(5);

    const res2 = await getPatternsUi(app);
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.payload);
    expect(body2.patterns[0].usageCount).toBe(5);

    const row = await adminPool.query(`SELECT usage_count FROM patterns WHERE title = $1`, [
      "No bump pattern",
    ]);
    expect(row.rows[0].usage_count).toBe(5);
  });

  it("returns global patterns when no project filter", async () => {
    const app = buildTestApp(appPool, db);
    await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: null,
      title: "Global pattern",
      stackTags: ["typescript"],
    });

    const res = await getPatternsUi(app, { tags: "typescript" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns.map((p: { title: string }) => p.title)).toContain("Global pattern");
  });

  it("returns camelCase shape with externalTaskRef", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Tracked pattern",
      codeExample: "const x = 1;",
      externalTaskRef: "86abc123",
      externalTrackerType: "clickup",
    });

    const res = await getPatternsUi(app);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const p = body.patterns[0];
    expect(p.id).toBeDefined();
    expect(p.title).toBe("Tracked pattern");
    expect(p.codeExample).toBe("const x = 1;");
    expect(p.stackTags).toEqual([]);
    expect(p.usageCount).toBe(1);
    expect(p.externalTaskRef).toBe("86abc123");
    expect(p.externalTrackerType).toBe("clickup");
    expect(p.lastUsedAt).toBeDefined();
  });

  it("returns empty array when no matches", async () => {
    const app = buildTestApp(appPool, db);
    await registerProject(app, "acme");

    const res = await getPatternsUi(app, { tags: "cobol-on-cogs" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ patterns: [], total: 0 });
  });

  it("total reflects corpus count independent of the page limit", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    for (let i = 1; i <= 5; i++) {
      await insertPattern(adminPool, {
        projectId: project_id,
        title: `Pattern ${i}`,
        stackTags: ["ts"],
      });
    }

    const res = await getPatternsUi(app, { tags: "ts", limit: "2" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it("returns empty when project slug does not exist", async () => {
    const app = buildTestApp(appPool, db);
    const res = await getPatternsUi(app, { project: "ghost-project" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ patterns: [], total: 0 });
  });
});

describe("GET /api/patterns/:id", () => {
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

  it("returns a single pattern by id", async () => {
    const app = buildTestApp(appPool, db);
    const { project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Single pattern",
    });

    const listRes = await getPatternsUi(app);
    const { patterns } = JSON.parse(listRes.payload);
    const id = patterns[0].id;

    const res = await app.inject({
      method: "GET",
      url: `/api/patterns/${id}`,
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.title).toBe("Single pattern");
  });

  it("returns 404 for unknown id", async () => {
    const app = buildTestApp(appPool, db);
    const res = await app.inject({
      method: "GET",
      url: "/api/patterns/00000000-0000-0000-0000-000000000000",
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
