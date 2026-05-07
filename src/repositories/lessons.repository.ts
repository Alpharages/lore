import { and, eq, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { lessonNotFound } from "../utils/errors.js";

export type LessonsTx = NodePgDatabase<typeof schema>;

export interface InsertLessonValues {
  projectId: string;
  repoId?: string | null;
  sessionId?: string | null;
  title: string;
  problem: string;
  rootCause?: string | null;
  fix: string;
  preventionRule: string;
  stackTags: string[];
  category?: string | null;
  severity: "critical" | "high" | "medium" | "low";
  capturedByUser?: string | null;
  provenance: Record<string, unknown>;
  embedding?: number[] | null;
  embeddingStatus?: "pending" | "complete" | "failed" | null;
}

export const insertLesson = async (
  db: LessonsTx,
  values: InsertLessonValues
): Promise<{ id: string }> => {
  const [lesson] = await db
    .insert(schema.lessons)
    .values({
      projectId: values.projectId,
      repoId: values.repoId,
      sessionId: values.sessionId,
      title: values.title,
      problem: values.problem,
      rootCause: values.rootCause,
      fix: values.fix,
      preventionRule: values.preventionRule,
      stackTags: values.stackTags,
      category: values.category,
      severity: values.severity,
      capturedByUser: values.capturedByUser,
      provenance: values.provenance,
      embedding: values.embedding ?? undefined,
      embeddingStatus: values.embeddingStatus ?? undefined,
    })
    .returning({ id: schema.lessons.id });
  return lesson;
};

export const findSessionById = async (
  db: LessonsTx,
  id: string
): Promise<{ id: string } | undefined> => {
  const rows = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, id))
    .limit(1);

  return rows[0];
};

export const findLessonById = async (
  db: LessonsTx,
  id: string
): Promise<
  | {
      id: string;
      projectId: string | null;
      title: string;
      embeddingStatus: string | null;
    }
  | undefined
> => {
  const rows = await db
    .select({
      id: schema.lessons.id,
      projectId: schema.lessons.projectId,
      title: schema.lessons.title,
      embeddingStatus: schema.lessons.embeddingStatus,
    })
    .from(schema.lessons)
    .where(eq(schema.lessons.id, id))
    .limit(1);

  return rows[0];
};

export const findSimilarLesson = async (
  db: LessonsTx,
  embedding: number[],
  threshold: number,
  projectId: string
): Promise<{ id: string; similarity: number } | null> => {
  const vectorParam = `[${embedding.join(",")}]`;

  const result = await db.execute(
    sql`
      SELECT id, 1 - (embedding <=> ${vectorParam}::vector) AS similarity
      FROM ${schema.lessons}
      WHERE project_id = ${projectId}::uuid
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorParam}::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT 1
    `
  );

  const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
  if (rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  return { id: String(row.id), similarity: Number(row.similarity) };
};

// Acquires a transaction-scoped advisory lock keyed by project_id so that
// concurrent save_lesson calls within the same project serialise around the
// dedup-check + insert path. The lock is automatically released on COMMIT or
// ROLLBACK. Cross-project saves are unaffected — keys are per-project.
export const acquireSaveLessonLock = async (db: LessonsTx, projectId: string): Promise<void> => {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('save_lesson:' || ${projectId}))`);
};

export const incrementOccurrence = async (
  db: LessonsTx,
  lessonId: string,
  projectId: string,
  userHandle?: string | null
): Promise<{ lessonId: string; newCount: number }> => {
  const [result] = await db
    .update(schema.lessons)
    .set({
      occurrenceCount: sql`${schema.lessons.occurrenceCount} + 1`,
      // DB-authoritative timestamp avoids cross-server clock skew.
      lastSeenAt: sql`NOW()`,
      // Append the user only if they're not already in the array — the column
      // is intended as a unique-user set, not a per-hit log.
      ...(userHandle
        ? {
            hitByUsers: sql`CASE
              WHEN ${userHandle} = ANY(${schema.lessons.hitByUsers})
              THEN ${schema.lessons.hitByUsers}
              ELSE array_append(${schema.lessons.hitByUsers}, ${userHandle})
            END`,
          }
        : {}),
    })
    .where(and(eq(schema.lessons.id, lessonId), eq(schema.lessons.projectId, projectId)))
    .returning({
      id: schema.lessons.id,
      occurrenceCount: schema.lessons.occurrenceCount,
    });

  if (!result) {
    throw lessonNotFound(lessonId);
  }

  return { lessonId: result.id, newCount: result.occurrenceCount ?? 0 };
};
