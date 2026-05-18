import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { createTestPool, createTestDb, buildTestApp, resetDatabase } from "./helper.js";
import { lessons, lessonPropagations } from "../../src/db/schema.js";
import { eq } from "drizzle-orm";

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

describe("Propagation Actions Tooling", () => {
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

  it("Scenario 1: accept_propagation successfully creates a lesson and updates status", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: targetKey, project_id: targetProjectId } = await registerProject(
      app,
      "target-project"
    );
    const { project_id: sourceProjectId } = await registerProject(app, "source-project");

    const [lessonA] = await db
      .insert(lessons)
      .values({
        projectId: sourceProjectId,
        title: "Title A",
        problem: "Problem A",
        fix: "Fix A",
        preventionRule: "Rule A",
        severity: "high",
        occurrenceCount: 2,
        stackTags: ["ts"],
      })
      .returning();

    const [prop] = await db
      .insert(lessonPropagations)
      .values({
        sourceLessonId: lessonA.id,
        targetProjectId,
        status: "suggested",
      })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/accept_propagation",
      headers: {
        authorization: `Bearer ${targetKey}`,
        "content-type": "application/json",
      },
      payload: { propagation_id: prop.id },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.action).toBe("accepted");
    expect(body.new_lesson_id).toBeDefined();

    // Verify propagation status in DB
    const [updatedProp] = await db
      .select()
      .from(lessonPropagations)
      .where(eq(lessonPropagations.id, prop.id));
    expect(updatedProp.status).toBe("accepted");
    expect(updatedProp.reviewedAt).toBeDefined();

    // Verify new lesson in DB
    const [newLesson] = await db.select().from(lessons).where(eq(lessons.id, body.new_lesson_id));
    expect(newLesson.projectId).toBe(targetProjectId);
    expect(newLesson.title).toBe(lessonA.title);
    expect(newLesson.occurrenceCount).toBe(1);
    expect((newLesson.provenance as any).propagated_from).toBe(lessonA.id);
  });

  it("Scenario 2: reject_propagation updates status correctly", async () => {
    const app = buildTestApp(pool, db);
    const { api_key: targetKey, project_id: targetProjectId } = await registerProject(
      app,
      "target-project"
    );
    const { project_id: sourceProjectId } = await registerProject(app, "source-project");

    const [lessonA] = await db
      .insert(lessons)
      .values({
        projectId: sourceProjectId,
        title: "Title A",
        problem: "Problem A",
        fix: "Fix A",
        preventionRule: "Rule A",
        severity: "high",
      })
      .returning();

    const [prop] = await db
      .insert(lessonPropagations)
      .values({
        sourceLessonId: lessonA.id,
        targetProjectId,
        status: "suggested",
      })
      .returning();

    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/reject_propagation",
      headers: {
        authorization: `Bearer ${targetKey}`,
        "content-type": "application/json",
      },
      payload: { propagation_id: prop.id },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.action).toBe("rejected");

    const [updatedProp] = await db
      .select()
      .from(lessonPropagations)
      .where(eq(lessonPropagations.id, prop.id));
    expect(updatedProp.status).toBe("rejected");
    expect(updatedProp.reviewedAt).toBeDefined();
  });

  it("Scenario 3: unauthorized project cannot act on propagation", async () => {
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

    // Suggest for Project B
    const [prop] = await db
      .insert(lessonPropagations)
      .values({
        sourceLessonId: lesson.id,
        targetProjectId: projectBId,
        status: "suggested",
      })
      .returning();

    // Project A tries to accept it
    const res = await app.inject({
      method: "POST",
      url: "/mcp/tools/accept_propagation",
      headers: {
        authorization: `Bearer ${projectAKey}`,
        "content-type": "application/json",
      },
      payload: { propagation_id: prop.id },
    });

    expect(res.statusCode).toBe(404);
  });
});
