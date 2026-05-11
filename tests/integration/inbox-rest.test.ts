import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import { lessons, lessonPropagations } from "../../src/db/schema.js";

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

describe("GET /api/projects/:slug/inbox", () => {
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

  it("returns pending propagations for the authenticated project", async () => {
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
        title: "Test Lesson Title",
        problem: "Test problem description",
        fix: "Fix the problem",
        preventionRule: "Prevent it like this",
        severity: "high",
        occurrenceCount: 3,
        stackTags: ["typescript", "fastify"],
      })
      .returning();

    await db.insert(lessonPropagations).values({
      sourceLessonId: lesson.id,
      targetProjectId,
      status: "suggested",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/projects/target-project/inbox",
      headers: { authorization: `Bearer ${targetKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].title).toBe("Test Lesson Title");
    expect(body[0].problem).toBe("Test problem description");
    expect(body[0].severity).toBe("high");
    expect(body[0].occurrence_count).toBe(3);
    expect(body[0].stack_tags).toEqual(["typescript", "fastify"]);
    expect(body[0].id).toBeDefined();
  });

  it("returns empty array when no pending suggestions", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "empty-project");

    const res = await app.inject({
      method: "GET",
      url: "/api/projects/empty-project/inbox",
      headers: { authorization: `Bearer ${api_key}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it("returns 401 when URL slug does not match authenticated project slug", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: projectAKey } = await registerProject(app, "project-a");
    await registerProject(app, "project-b");

    const res = await app.inject({
      method: "GET",
      url: "/api/projects/project-b/inbox",
      headers: { authorization: `Bearer ${projectAKey}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 401 without authorization header", async () => {
    const app = buildTestApp(pool, db);
    await registerProject(app, "some-project");

    const res = await app.inject({
      method: "GET",
      url: "/api/projects/some-project/inbox",
    });

    expect(res.statusCode).toBe(401);
  });

  it("excludes non-suggested propagations from results", async () => {
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
        title: "Already Accepted",
        problem: "Problem",
        fix: "Fix",
        preventionRule: "Rule",
        severity: "high",
        occurrenceCount: 2,
        stackTags: ["ts"],
      })
      .returning();

    await db.insert(lessonPropagations).values({
      sourceLessonId: lesson.id,
      targetProjectId,
      status: "accepted",
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/projects/target-project/inbox",
      headers: { authorization: `Bearer ${targetKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBe(0);
  });
});

describe("POST /api/propagations/:id/accept", () => {
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

  it("accepts a propagation and copies the lesson to the target project", async () => {
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
        title: "Propagated Title",
        problem: "Problem",
        fix: "Fix",
        preventionRule: "Rule",
        severity: "critical",
        occurrenceCount: 2,
        stackTags: ["ts"],
      })
      .returning();

    const [prop] = await db
      .insert(lessonPropagations)
      .values({ sourceLessonId: lesson.id, targetProjectId, status: "suggested" })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/propagations/${prop.id}/accept`,
      headers: { authorization: `Bearer ${targetKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.action).toBe("accepted");
    expect(body.new_lesson_id).toBeDefined();
  });

  it("returns 401 when propagation belongs to another project", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: projectAKey } = await registerProject(app, "project-a");
    const { project_id: projectBId } = await registerProject(app, "project-b");
    const { project_id: sourceProjectId } = await registerProject(app, "source-project");

    const [lesson] = await db
      .insert(lessons)
      .values({
        projectId: sourceProjectId,
        title: "T",
        problem: "P",
        fix: "F",
        preventionRule: "R",
        severity: "high",
        occurrenceCount: 2,
        stackTags: ["ts"],
      })
      .returning();

    const [prop] = await db
      .insert(lessonPropagations)
      .values({ sourceLessonId: lesson.id, targetProjectId: projectBId, status: "suggested" })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/propagations/${prop.id}/accept`,
      headers: { authorization: `Bearer ${projectAKey}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent propagation", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "any-project");

    const res = await app.inject({
      method: "POST",
      url: "/api/propagations/00000000-0000-0000-0000-000000000000/accept",
      headers: { authorization: `Bearer ${api_key}` },
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/propagations/:id/reject", () => {
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

  it("rejects a propagation and updates status", async () => {
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
        title: "T",
        problem: "P",
        fix: "F",
        preventionRule: "R",
        severity: "high",
        occurrenceCount: 2,
        stackTags: ["ts"],
      })
      .returning();

    const [prop] = await db
      .insert(lessonPropagations)
      .values({ sourceLessonId: lesson.id, targetProjectId, status: "suggested" })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/propagations/${prop.id}/reject`,
      headers: { authorization: `Bearer ${targetKey}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.action).toBe("rejected");
  });

  it("returns 401 when propagation belongs to another project", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: projectAKey } = await registerProject(app, "project-a");
    const { project_id: projectBId } = await registerProject(app, "project-b");
    const { project_id: sourceProjectId } = await registerProject(app, "source-project");

    const [lesson] = await db
      .insert(lessons)
      .values({
        projectId: sourceProjectId,
        title: "T",
        problem: "P",
        fix: "F",
        preventionRule: "R",
        severity: "high",
      })
      .returning();

    const [prop] = await db
      .insert(lessonPropagations)
      .values({ sourceLessonId: lesson.id, targetProjectId: projectBId, status: "suggested" })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: `/api/propagations/${prop.id}/reject`,
      headers: { authorization: `Bearer ${projectAKey}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for non-existent propagation", async () => {
    const app = buildTestApp(pool, db);
    const { api_key } = await registerProject(app, "any-project");

    const res = await app.inject({
      method: "POST",
      url: "/api/propagations/00000000-0000-0000-0000-000000000000/reject",
      headers: { authorization: `Bearer ${api_key}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
