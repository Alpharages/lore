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

const queryLessons = async (app: any, apiKey: string, payload: Record<string, unknown>) => {
  return app.inject({
    method: "POST",
    url: "/mcp/tools/query_lessons",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    payload,
  });
};

const insertLesson = async (
  pool: Pool,
  values: {
    projectId: string | null;
    repoId?: string | null;
    title: string;
    stackTags?: string[];
    category?: string | null;
    severity?: "critical" | "high" | "medium" | "low";
    occurrenceCount?: number;
    lastSeenAt?: string;
  }
) => {
  await pool.query(
    `INSERT INTO lessons (
       project_id, repo_id, title, problem, fix, prevention_rule, stack_tags,
       category, severity, occurrence_count, last_seen_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, NOW()))`,
    [
      values.projectId,
      values.repoId ?? null,
      values.title,
      `${values.title} problem`,
      `${values.title} fix`,
      `${values.title} rule`,
      values.stackTags ?? [],
      values.category ?? null,
      values.severity ?? "medium",
      values.occurrenceCount ?? 1,
      values.lastSeenAt ?? null,
    ]
  );
};

describe("POST /mcp/tools/query_lessons", () => {
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

  it("filters by stack_tags, severity, category, and last_n_days", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Recent critical database lesson",
      stackTags: ["typescript", "postgres"],
      category: "database",
      severity: "critical",
      lastSeenAt: new Date().toISOString(),
    });
    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Old critical database lesson",
      stackTags: ["typescript"],
      category: "database",
      severity: "critical",
      lastSeenAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    });
    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Recent low auth lesson",
      stackTags: ["python"],
      category: "auth",
      severity: "low",
      lastSeenAt: new Date().toISOString(),
    });

    const res = await queryLessons(app, api_key, {
      stack_tags: ["typescript"],
      severity: "critical",
      category: "database",
      last_n_days: 30,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].title).toBe("Recent critical database lesson");
    expect(body.total).toBe(1);
  });

  it("returns max 5 results by default and supports limit up to 20", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    for (let i = 0; i < 20; i += 1) {
      await insertLesson(adminPool, {
        projectId: project_id,
        title: `Lesson ${i}`,
        occurrenceCount: i + 1,
        lastSeenAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      });
    }

    const defaultRes = await queryLessons(app, api_key, {});
    expect(defaultRes.statusCode).toBe(200);
    expect(JSON.parse(defaultRes.payload).lessons).toHaveLength(5);

    const customRes = await queryLessons(app, api_key, { limit: 15 });
    expect(customRes.statusCode).toBe(200);
    expect(JSON.parse(customRes.payload).lessons).toHaveLength(15);
  });

  it("ranks results by relevance score", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Lower relevance lesson",
      stackTags: ["typescript"],
      severity: "low",
      occurrenceCount: 1,
      lastSeenAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    });
    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Higher relevance lesson",
      stackTags: ["typescript", "postgres"],
      severity: "critical",
      occurrenceCount: 20,
      lastSeenAt: new Date().toISOString(),
    });

    const res = await queryLessons(app, api_key, { stack_tags: ["typescript"] });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons[0].title).toBe("Higher relevance lesson");
    expect(body.lessons[0].relevance_score).toBeGreaterThan(body.lessons[1].relevance_score);
  });

  it("returns project-scoped lessons plus global lessons and excludes other projects", async () => {
    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await insertLesson(adminPool, { projectId: projectA.project_id, title: "Project A lesson" });
    await insertLesson(adminPool, { projectId: projectB.project_id, title: "Project B lesson" });
    await insertLesson(adminPool, { projectId: null, title: "Global lesson" });

    const res = await queryLessons(app, projectA.api_key, {});

    expect(res.statusCode).toBe(200);
    const titles = JSON.parse(res.payload).lessons.map((lesson: { title: string }) => lesson.title);
    expect(titles).toContain("Project A lesson");
    expect(titles).toContain("Global lesson");
    expect(titles).not.toContain("Project B lesson");
  });

  it("resolves repo_slug to repo_id and returns empty for unknown slugs", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");
    const repo = await adminPool.query(
      `SELECT id FROM repositories WHERE project_id = $1 AND slug = 'backend'`,
      [project_id]
    );

    await insertLesson(adminPool, {
      projectId: project_id,
      repoId: repo.rows[0].id,
      title: "Backend lesson",
    });
    await insertLesson(adminPool, { projectId: project_id, title: "Project-wide lesson" });

    const repoRes = await queryLessons(app, api_key, { repo_slug: "backend" });
    expect(repoRes.statusCode).toBe(200);
    expect(
      JSON.parse(repoRes.payload).lessons.map((lesson: { title: string }) => lesson.title)
    ).toEqual(["Backend lesson"]);

    const unknownRes = await queryLessons(app, api_key, { repo_slug: "missing" });
    expect(unknownRes.statusCode).toBe(200);
    expect(JSON.parse(unknownRes.payload)).toEqual({ lessons: [], total: 0 });
  });

  it("returns an empty array when no lessons match", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Low severity lesson",
      severity: "low",
    });

    const res = await queryLessons(app, api_key, { severity: "critical" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ lessons: [], total: 0 });
  });

  it("validates request body through the route schema", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    const invalidLimit = await queryLessons(app, api_key, { limit: 25 });
    expect(invalidLimit.statusCode).toBe(400);
    expect(JSON.parse(invalidLimit.payload).error).toBe("validation_error");

    const invalidLastNDays = await queryLessons(app, api_key, { last_n_days: 0 });
    expect(invalidLastNDays.statusCode).toBe(400);
    expect(JSON.parse(invalidLastNDays.payload).error).toBe("validation_error");

    const invalidSeverity = await queryLessons(app, api_key, { severity: "CRITICAL" });
    expect(invalidSeverity.statusCode).toBe(400);
    expect(JSON.parse(invalidSeverity.payload).error).toBe("validation_error");
  });
});
