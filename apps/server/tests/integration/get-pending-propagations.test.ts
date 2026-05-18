import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import { projects, lessons, lessonPropagations } from "../../src/db/schema.js";

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

describe("POST /mcp/tools/get_pending_propagations", () => {
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

  it("returns pending suggestions and hides source project name", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: targetKey, project_id: targetProjectId } = await registerProject(
      app,
      "target-project"
    );
    const { project_id: sourceProjectId } = await registerProject(app, "source-project");

    const [lesson] = await db
      .insert(lessons)
      .values({
        projectId: sourceProjectId,
        title: "Test Lesson",
        problem: "Test Problem",
        fix: "Test Fix",
        preventionRule: "Test Rule",
        severity: "high",
        occurrenceCount: 2,
        stackTags: ["typescript"],
      })
      .returning();

    await db.insert(lessonPropagations).values({
      sourceLessonId: lesson.id,
      targetProjectId,
      status: "suggested",
    });

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/get_pending_propagations",
      headers: {
        authorization: `Bearer ${targetKey}`,
        "content-type": "application/json",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    // Using stringify check or direct mapping check, MCP returns a tool result
    // But since this is a fastify endpoint matching MCP wrapper:
    // It returns { result: ... } or just the raw list depending on wrapper?
    // Let's assume it returns what the controller returns (an array).
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);

    const prop = body[0];
    expect(prop.title).toBe("Test Lesson");
    expect(prop.problem).toBe("Test Problem");
    expect(prop.severity).toBe("high");
    expect(prop.occurrence_count).toBe(2);
    expect(prop.stack_tags).toEqual(["typescript"]);
    expect(prop.source_project_name).toBeUndefined();
    expect(prop.source_project_id).toBeUndefined();
  });

  it("returns empty array if no pending suggestions", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "empty-project");

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/get_pending_propagations",
      headers: {
        authorization: `Bearer ${api_key}`,
        "content-type": "application/json",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("isolates suggestions by project", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: projectAKey, project_id: projectIdA } = await registerProject(
      app,
      "project-a"
    );
    const { api_key: projectBKey, project_id: projectIdB } = await registerProject(
      app,
      "project-b"
    );
    const { project_id: sourceProjectId } = await registerProject(app, "source-project");

    const [lesson] = await db
      .insert(lessons)
      .values({
        projectId: sourceProjectId,
        title: "Test Lesson",
        problem: "Test Problem",
        fix: "Test Fix",
        preventionRule: "Test Rule",
        severity: "high",
        occurrenceCount: 2,
        stackTags: ["typescript"],
      })
      .returning();

    // Suggest ONLY to Project B
    await db.insert(lessonPropagations).values({
      sourceLessonId: lesson.id,
      targetProjectId: projectIdB,
      status: "suggested",
    });

    // Project A calls -> empty
    const resA = await app.inject({
      method: "POST",
      url: "/mcp/tools/get_pending_propagations",
      headers: {
        authorization: `Bearer ${projectAKey}`,
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.payload);
    expect(bodyA.length).toBe(0);

    // Project B calls -> 1 item
    const resB = await app.inject({
      method: "POST",
      url: "/mcp/tools/get_pending_propagations",
      headers: {
        authorization: `Bearer ${projectBKey}`,
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(resB.statusCode).toBe(200);
    const bodyB = JSON.parse(resB.payload);
    expect(bodyB.length).toBe(1);
  });
});
