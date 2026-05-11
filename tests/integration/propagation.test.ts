import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTestPool, createTestDb, resetDatabase } from "./helper.js";
import { startPropagationEngine } from "../../src/services/propagation.js";
import { projects, lessons, lessonPropagations } from "../../src/db/schema.js";
import { eq, and } from "drizzle-orm";
import { Pool } from "pg";

describe("Propagation Engine", () => {
  let pool: Pool;
  let db: ReturnType<typeof createTestDb>;

  beforeEach(async () => {
    pool = createTestPool();
    db = createTestDb(pool);
    await resetDatabase(pool);
    vi.useFakeTimers();
    process.env.PROPAGATION_ENABLED = "true";
    process.env.PROPAGATION_INTERVAL_MS = "3600000";
  });

  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
    await pool.end();
  });

  it("Scenario 1: Qualifying lesson propagates", async () => {
    // Given Project A and Project B with matching stack
    const [projectA] = await db
      .insert(projects)
      .values({
        slug: "project-a",
        name: "Project A",
        apiKeyHash: "hash-a",
        stackTags: ["typescript", "react"],
      })
      .returning();

    const [projectB] = await db
      .insert(projects)
      .values({
        slug: "project-b",
        name: "Project B",
        apiKeyHash: "hash-b",
        stackTags: ["typescript", "node"],
      })
      .returning();

    // Given a qualifying lesson in Project A
    const [lesson] = await db
      .insert(lessons)
      .values({
        projectId: projectA.id,
        title: "Qualifying Lesson",
        problem: "Problem",
        fix: "Fix",
        preventionRule: "Rule",
        severity: "high",
        occurrenceCount: 2,
        stackTags: ["typescript"],
      })
      .returning();

    // When propagation engine runs
    startPropagationEngine();
    await vi.advanceTimersByTimeAsync(3600000);

    // Then a propagation is created for Project B
    const propagations = await db
      .select()
      .from(lessonPropagations)
      .where(
        and(
          eq(lessonPropagations.sourceLessonId, lesson.id),
          eq(lessonPropagations.targetProjectId, projectB.id)
        )
      );

    expect(propagations.length).toBe(1);
    expect(propagations[0].status).toBe("suggested");
  });

  it("Scenario 2: Non-qualifying lesson ignored", async () => {
    const [projectA] = await db
      .insert(projects)
      .values({
        slug: "project-a2",
        name: "Project A2",
        apiKeyHash: "hash-a2",
        stackTags: ["typescript"],
      })
      .returning();

    const [projectB] = await db
      .insert(projects)
      .values({
        slug: "project-b2",
        name: "Project B2",
        apiKeyHash: "hash-b2",
        stackTags: ["typescript"],
      })
      .returning();

    // Non-qualifying (occurrence = 1)
    await db.insert(lessons).values({
      projectId: projectA.id,
      title: "Non-Qualifying Lesson",
      problem: "Problem",
      fix: "Fix",
      preventionRule: "Rule",
      severity: "high",
      occurrenceCount: 1,
      stackTags: ["typescript"],
    });

    // Non-qualifying (severity = medium)
    await db.insert(lessons).values({
      projectId: projectA.id,
      title: "Non-Qualifying Lesson 2",
      problem: "Problem",
      fix: "Fix",
      preventionRule: "Rule",
      severity: "medium",
      occurrenceCount: 2,
      stackTags: ["typescript"],
    });

    startPropagationEngine();
    await vi.advanceTimersByTimeAsync(3600000);

    const propagations = await db.select().from(lessonPropagations);
    expect(propagations.length).toBe(0);
  });

  it("Scenario 3: No duplicate suggestions", async () => {
    const [projectA] = await db
      .insert(projects)
      .values({
        slug: "project-a3",
        name: "Project A3",
        apiKeyHash: "hash-a3",
        stackTags: ["python"],
      })
      .returning();

    const [projectB] = await db
      .insert(projects)
      .values({
        slug: "project-b3",
        name: "Project B3",
        apiKeyHash: "hash-b3",
        stackTags: ["python"],
      })
      .returning();

    const [lesson] = await db
      .insert(lessons)
      .values({
        projectId: projectA.id,
        title: "Duplicate Test Lesson",
        problem: "Problem",
        fix: "Fix",
        preventionRule: "Rule",
        severity: "critical",
        occurrenceCount: 2,
        stackTags: ["python"],
      })
      .returning();

    // Insert existing propagation
    await db.insert(lessonPropagations).values({
      sourceLessonId: lesson.id,
      targetProjectId: projectB.id,
      status: "suggested",
    });

    startPropagationEngine();
    await vi.advanceTimersByTimeAsync(3600000);

    const propagations = await db.select().from(lessonPropagations);
    // Only 1 propagation should exist, no duplicates
    expect(propagations.length).toBe(1);
  });

  it("Scenario 4: Feature toggle disables engine", async () => {
    process.env.PROPAGATION_ENABLED = "false";

    const [projectA] = await db
      .insert(projects)
      .values({
        slug: "project-a4",
        name: "Project A4",
        apiKeyHash: "hash-a4",
        stackTags: ["go"],
      })
      .returning();

    const [projectB] = await db
      .insert(projects)
      .values({
        slug: "project-b4",
        name: "Project B4",
        apiKeyHash: "hash-b4",
        stackTags: ["go"],
      })
      .returning();

    await db.insert(lessons).values({
      projectId: projectA.id,
      title: "Toggle Test Lesson",
      problem: "Problem",
      fix: "Fix",
      preventionRule: "Rule",
      severity: "high",
      occurrenceCount: 2,
      stackTags: ["go"],
    });

    startPropagationEngine();
    await vi.advanceTimersByTimeAsync(3600000);

    const propagations = await db.select().from(lessonPropagations);
    // Should be 0 since the engine didn't run its queries
    expect(propagations.length).toBe(0);
  });
});
