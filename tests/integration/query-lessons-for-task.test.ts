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
import { generateEmbedding } from "../../src/services/embedding.js";

vi.mock("../../src/services/embedding.js", () => ({
  generateEmbedding: vi.fn(),
}));

const ADMIN_SECRET = "test_admin_secret_do_not_ship";
process.env.ADMIN_SECRET = ADMIN_SECRET;

/** Unit vector (dimension 1536) for deterministic pgvector cosine tests. */
const TEST_EMBEDDING_1536 = (() => {
  const v = new Array<number>(1536).fill(0);
  v[0] = 1;
  return v;
})();

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

const queryLessonsForTask = async (app: any, apiKey: string, payload: Record<string, unknown>) => {
  return app.inject({
    method: "POST",
    url: "/mcp/tools/query_lessons_for_task",
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
    externalTaskId?: string | null;
    embedding?: number[] | null;
  }
) => {
  await pool.query(
    `INSERT INTO lessons (
       project_id, repo_id, title, problem, fix, prevention_rule, stack_tags,
       category, severity, occurrence_count, last_seen_at, external_task_id, embedding
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, NOW()), $12, $13)`,
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
      values.externalTaskId ?? null,
      values.embedding ? `[${values.embedding.join(",")}]` : null,
    ]
  );
};

const insertPattern = async (
  pool: Pool,
  values: {
    projectId: string | null;
    title: string;
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
      `${values.title} description`,
      values.stackTags ?? [],
      values.category ?? null,
      values.usageCount ?? 1,
      values.lastUsedAt ?? null,
      values.embedding ? `[${values.embedding.join(",")}]` : null,
    ]
  );
};

describe("POST /mcp/tools/query_lessons_for_task", () => {
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
    vi.mocked(generateEmbedding).mockReset();
    vi.mocked(generateEmbedding).mockResolvedValue(null);
  });

  it("returns lessons with stack tag match and match_reason 'stack'", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "TypeScript Drizzle lesson",
      stackTags: ["typescript", "drizzle"],
    });

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-123",
      task_context: {
        stack_tags: ["typescript"],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].title).toBe("TypeScript Drizzle lesson");
    expect(body.lessons[0].match_reason).toBe("stack");
    expect(body.total).toBe(1);
  });

  it("returns epic-scoped lessons with match_reason 'epic-sibling'", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Epic level lesson",
      externalTaskId: "epic-123",
    });

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-456",
      task_context: {
        parent_epic_id: "epic-123",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].title).toBe("Epic level lesson");
    expect(body.lessons[0].match_reason).toBe("epic-sibling");
  });

  it("returns lessons tied to the same external_task_id with match_reason 'task'", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Prior attempt on this task",
      externalTaskId: "task-same-99",
    });

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-same-99",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].match_reason).toBe("task");
  });

  it("prefers match_reason 'task' over 'stack' when the same lesson hits both branches (tie on similarity)", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Dual match lesson",
      stackTags: ["rust"],
      externalTaskId: "task-dup-1",
    });

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-dup-1",
      task_context: { stack_tags: ["rust"] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].match_reason).toBe("task");
  });

  it("skips embedding when only title is present (no description)", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Tag lesson",
      stackTags: ["python"],
    });

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-789",
      task_context: {
        title: "Some title",
        stack_tags: ["python"],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(generateEmbedding).not.toHaveBeenCalled();
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].match_reason).toBe("stack");
  });

  it("returns semantic match when title and description are present and embedding matches stored vector", async () => {
    vi.mocked(generateEmbedding).mockResolvedValue(TEST_EMBEDDING_1536);

    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Semantic lesson",
      stackTags: [],
      embedding: TEST_EMBEDDING_1536,
    });

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-sem-1",
      task_context: {
        title: "Any title",
        description: "Any description",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].title).toBe("Semantic lesson");
    expect(body.lessons[0].match_reason).toBe("semantic");
  });

  it("returns stack matches when embedding generation fails but title and description were provided", async () => {
    vi.mocked(generateEmbedding).mockResolvedValue(null);

    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Fallback stack lesson",
      stackTags: ["go"],
    });

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-fallback",
      task_context: {
        title: "t",
        description: "d",
        stack_tags: ["go"],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].match_reason).toBe("stack");
  });

  it("completes within 500ms when embedding is mocked (NFR-03 smoke)", async () => {
    vi.mocked(generateEmbedding).mockResolvedValue(TEST_EMBEDDING_1536);

    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertLesson(adminPool, {
      projectId: project_id,
      title: "Perf lesson",
      embedding: TEST_EMBEDDING_1536,
    });

    const t0 = Date.now();
    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-perf",
      task_context: { title: "x", description: "y" },
    });
    const elapsed = Date.now() - t0;

    expect(res.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(500);
  });

  it("returns empty result gracefully when no matches", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-000",
      task_context: {
        stack_tags: ["rust"],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ lessons: [], patterns: [], total: 0 });
  });

  it("validates request body through route schema", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key } = await registerProject(app, "acme");

    const missingTaskId = await queryLessonsForTask(app, api_key, {
      task_context: { title: "test" },
    });
    expect(missingTaskId.statusCode).toBe(400);
    expect(JSON.parse(missingTaskId.payload).error).toBe("validation_error");

    const limitTooHigh = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-1",
      limit: 25,
    });
    expect(limitTooHigh.statusCode).toBe(400);
    expect(JSON.parse(limitTooHigh.payload).error).toBe("validation_error");
  });

  it("includes global lessons and excludes other projects", async () => {
    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await insertLesson(adminPool, {
      projectId: projectA.project_id,
      title: "Project A lesson",
      stackTags: ["typescript"],
    });
    await insertLesson(adminPool, {
      projectId: projectB.project_id,
      title: "Project B lesson",
      stackTags: ["typescript"],
    });
    await insertLesson(adminPool, {
      projectId: null,
      title: "Global lesson",
      stackTags: ["typescript"],
    });

    const res = await queryLessonsForTask(app, projectA.api_key, {
      external_task_id: "task-1",
      task_context: {
        stack_tags: ["typescript"],
      },
    });

    expect(res.statusCode).toBe(200);
    const titles = JSON.parse(res.payload).lessons.map((l: { title: string }) => l.title);
    expect(titles).toContain("Project A lesson");
    expect(titles).toContain("Global lesson");
    expect(titles).not.toContain("Project B lesson");
  });

  it("returns patterns with matching stack tags", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    await insertPattern(adminPool, {
      projectId: project_id,
      title: "TypeScript pattern",
      stackTags: ["typescript"],
    });

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-1",
      task_context: {
        stack_tags: ["typescript"],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.patterns).toHaveLength(1);
    expect(body.patterns[0].title).toBe("TypeScript pattern");
    expect(body.patterns[0].match_reason).toBe("stack");
  });

  it("respects combined limit and returns highest-ranked items (stack branch active)", async () => {
    const app = buildTestApp(appPool, db);
    const { api_key, project_id } = await registerProject(app, "acme");

    for (let i = 0; i < 5; i += 1) {
      await insertLesson(adminPool, {
        projectId: project_id,
        title: `Rank lesson ${i}`,
        stackTags: ["limitrank"],
        occurrenceCount: i + 1,
        lastSeenAt: new Date(Date.now() - i * 86_400_000).toISOString(),
      });
    }

    const res = await queryLessonsForTask(app, api_key, {
      external_task_id: "task-1",
      task_context: { stack_tags: ["limitrank"] },
      limit: 2,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons.length + body.patterns.length).toBe(2);
    expect(body.total).toBe(2);
    const titles = body.lessons.map((l: { title: string }) => l.title);
    expect(titles).toContain("Rank lesson 4");
    expect(titles).toContain("Rank lesson 3");
  });
});
