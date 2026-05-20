import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
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

const savePattern = async (app: any, apiKey: string, payload: Record<string, unknown>) => {
  return app.inject({
    method: "POST",
    url: "/mcp/tools/save_pattern",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    payload,
  });
};

const getPatterns = async (app: any, apiKey: string, payload: Record<string, unknown> = {}) => {
  return app.inject({
    method: "POST",
    url: "/mcp/tools/get_patterns",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    payload,
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
    embedding?: number[] | null;
  }
) => {
  await pool.query(
    `INSERT INTO patterns (
       project_id, title, description, stack_tags, category,
       usage_count, last_used_at, embedding
     )
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8)`,
    [
      values.projectId,
      values.title,
      values.description ?? `${values.title} description`,
      values.stackTags ?? [],
      values.category ?? null,
      values.usageCount ?? 1,
      values.lastUsedAt ?? null,
      values.embedding ? `[${values.embedding.join(",")}]` : null,
    ]
  );
};

describe("POST /mcp/tools/get_patterns", () => {
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
    vi.restoreAllMocks();
  });

  it("returns patterns filtered by stack_tags", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

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

    const res = await getPatterns(app, api_key, { stack_tags: ["fastify"] });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].title).toBe("Fastify pattern");
  });

  it("returns patterns filtered by category", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

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

    const res = await getPatterns(app, api_key, { category: "architecture" });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].title).toBe("Arch pattern");
  });

  it("orders by usage_count DESC", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Low usage",
      usageCount: 1,
    });
    await insertPattern(adminPool, {
      projectId: project_id,
      title: "High usage",
      usageCount: 5,
    });
    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Medium usage",
      usageCount: 3,
    });

    const res = await getPatterns(app, api_key);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns.map((p: { title: string }) => p.title)).toEqual([
      "High usage",
      "Medium usage",
      "Low usage",
    ]);
  });

  it("bumps usage_count on read", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Bumpable pattern",
      usageCount: 1,
    });

    const res1 = await getPatterns(app, api_key);
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.payload);
    expect(body1.patterns[0].usage_count).toBe(2);

    const res2 = await getPatterns(app, api_key);
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.payload);
    expect(body2.patterns[0].usage_count).toBe(3);
  });

  it("rolls back the usage bump when the request errors after it (same-transaction guarantee)", async () => {
    // Drive a failure *after* the bump has run, then assert the committed
    // usage_count is unchanged. This only holds if the bump shares the request
    // transaction (AC-2); a bump on a separate connection would commit to 2.
    const patternsRepo = await import("../../src/repositories/patterns.repository.js");
    const realBump = patternsRepo.bumpPatternUsage;
    vi.spyOn(patternsRepo, "bumpPatternUsage").mockImplementation(async (txDb, ids) => {
      await realBump(txDb, ids);
      throw new Error("simulated failure after usage bump");
    });

    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "Rollback pattern",
      usageCount: 1,
    });

    const res = await getPatterns(app, api_key);
    expect(res.statusCode).toBeGreaterThanOrEqual(500);

    const row = await adminPool.query(`SELECT usage_count FROM patterns WHERE title = $1`, [
      "Rollback pattern",
    ]);
    expect(row.rows[0].usage_count).toBe(1);
  });

  it("returns empty array when no matches", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await getPatterns(app, api_key, { stack_tags: ["cobol-on-cogs"] });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ patterns: [] });
  });

  it("respects limit parameter", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    for (let i = 0; i < 5; i += 1) {
      await insertPattern(adminPool, {
        projectId: project_id,
        title: `Pattern ${i}`,
        usageCount: i + 1,
      });
    }

    const res = await getPatterns(app, api_key, { limit: 2 });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns).toHaveLength(2);
  });

  it("rejects limit out of bounds with 400", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await getPatterns(app, api_key, { limit: 25 });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("validation_error");
  });

  it("includes global patterns for all projects", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: null,
      title: "Global pattern",
      stackTags: ["typescript"],
    });

    const res = await getPatterns(app, api_key, { stack_tags: ["typescript"] });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns.map((p: { title: string }) => p.title)).toContain("Global pattern");
  });

  it("isolates patterns by project (RLS)", async () => {
    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await insertPattern(adminPool, {
      projectId: projectA.project_id,
      title: "Project A pattern",
      stackTags: ["typescript"],
    });

    const res = await getPatterns(app, projectB.api_key, { stack_tags: ["typescript"] });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns).toHaveLength(0);
  });

  it("returns patterns via save_pattern then get_patterns e2e", async () => {
    vi.spyOn(
      await import("../../src/services/embedding.js"),
      "generateEmbedding"
    ).mockResolvedValue(null);
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    const saveRes = await savePattern(app, api_key, {
      title: "E2E pattern",
      description: "End to end test pattern",
      stack_tags: ["typescript"],
    });
    expect(saveRes.statusCode).toBe(201);

    const getRes = await getPatterns(app, api_key, { stack_tags: ["typescript"] });
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.payload);
    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].title).toBe("E2E pattern");
    expect(body.patterns[0].usage_count).toBe(2); // 1 from insert + 1 from get
  });
});
