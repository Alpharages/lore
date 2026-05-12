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
import * as embedding from "../../src/services/embedding.js";
import { lessonPropagations } from "../../src/db/schema.js";

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

const makeVector = (value: number, dim = 1536): number[] => {
  const arr = new Array(dim).fill(0);
  arr[0] = value;
  return arr;
};

describe("RLS Isolation Audit", () => {
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
      try {
        await client.query("SET ROLE lore_app");
      } catch (err) {
        client.release();
        throw err;
      }
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
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(null);
  });

  it("AC-1: creates two projects with separate API keys", async () => {
    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    expect(projectA.api_key).toBeDefined();
    expect(projectB.api_key).toBeDefined();
    expect(projectA.api_key).not.toBe(projectB.api_key);
    expect(projectA.project_id).not.toBe(projectB.project_id);
  });

  it("AC-2: Project B's query_lessons returns no results from Project A's lessons", async () => {
    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await adminPool.query(
      `INSERT INTO lessons (project_id, title, problem, fix, prevention_rule)
       VALUES ($1, 'Project A lesson', 'problem', 'fix', 'rule')`,
      [projectA.project_id]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/query_lessons",
      headers: {
        authorization: `Bearer ${projectB.api_key}`,
        "content-type": "application/json",
      },
      payload: { stack_tags: [] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("AC-3: Project B's search_similar returns no results from Project A's lessons", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await adminPool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
       VALUES ($1, $2, 'Project A lesson', 'problem', 'fix', 'rule', $3::vector, 'complete', 1)`,
      ["11111111-1111-1111-1111-111111111111", projectA.project_id, `[${vec.join(",")}]`]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/search_similar",
      headers: {
        authorization: `Bearer ${projectB.api_key}`,
        "content-type": "application/json",
      },
      payload: { text: "database connection pool" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("AC-4: Project B's query_lessons_for_task returns no results from Project A", async () => {
    const vec = makeVector(1);
    vi.spyOn(embedding, "generateEmbedding").mockResolvedValue(vec);

    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await adminPool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule, embedding, embedding_status, occurrence_count)
       VALUES ($1, $2, 'Project A lesson', 'problem', 'fix', 'rule', $3::vector, 'complete', 1)`,
      ["11111111-1111-1111-1111-111111111111", projectA.project_id, `[${vec.join(",")}]`]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/query_lessons_for_task",
      headers: {
        authorization: `Bearer ${projectB.api_key}`,
        "content-type": "application/json",
      },
      payload: {
        external_task_id: "task-123",
        task_context: {
          title: "Project A lesson",
          stack_tags: ["typescript"],
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toEqual([]);
    expect(body.patterns).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("AC-5: accept_propagation on Project A's propagation from Project B returns 403", async () => {
    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await adminPool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule)
       VALUES ($1, $2, 'Source lesson', 'problem', 'fix', 'rule')`,
      ["11111111-1111-1111-1111-111111111111", projectA.project_id]
    );

    const [prop] = await db
      .insert(lessonPropagations)
      .values({
        sourceLessonId: "11111111-1111-1111-1111-111111111111",
        targetProjectId: projectA.project_id,
        status: "suggested",
      })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/accept_propagation",
      headers: {
        authorization: `Bearer ${projectB.api_key}`,
        "content-type": "application/json",
      },
      payload: { propagation_id: prop.id },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe("forbidden");
  });

  it("global lessons (project_id IS NULL) are visible to Project B", async () => {
    const app = buildTestApp(appPool, db);
    const projectB = await registerProject(app, "project-b");

    await adminPool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule)
       VALUES ($1, NULL, 'Global lesson', 'problem', 'fix', 'rule')`,
      ["11111111-1111-1111-1111-111111111111"]
    );

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/query_lessons",
      headers: {
        authorization: `Bearer ${projectB.api_key}`,
        "content-type": "application/json",
      },
      payload: { stack_tags: [] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].title).toBe("Global lesson");
  });

  it("Project B can accept a propagation that correctly targets Project B", async () => {
    const app = buildTestApp(appPool, db);
    const projectA = await registerProject(app, "project-a");
    const projectB = await registerProject(app, "project-b");

    await adminPool.query(
      `INSERT INTO lessons (id, project_id, title, problem, fix, prevention_rule)
       VALUES ($1, $2, 'Source lesson', 'problem', 'fix', 'rule')`,
      ["11111111-1111-1111-1111-111111111111", projectA.project_id]
    );

    const [prop] = await db
      .insert(lessonPropagations)
      .values({
        sourceLessonId: "11111111-1111-1111-1111-111111111111",
        targetProjectId: projectB.project_id,
        status: "suggested",
      })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/accept_propagation",
      headers: {
        authorization: `Bearer ${projectB.api_key}`,
        "content-type": "application/json",
      },
      payload: { propagation_id: prop.id },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.action).toBe("accepted");
    expect(body.new_lesson_id).toBeDefined();
  });
});
