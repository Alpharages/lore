import { and, gte, inArray, sql, eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export type PropagationTx = NodePgDatabase<typeof schema>;

export interface QualifyingLesson {
  id: string;
  projectId: string | null;
  stackTags: string[] | null;
}

export const findQualifyingLessons = async (db: PropagationTx): Promise<QualifyingLesson[]> => {
  return db
    .select({
      id: schema.lessons.id,
      projectId: schema.lessons.projectId,
      stackTags: schema.lessons.stackTags,
    })
    .from(schema.lessons)
    .where(
      and(
        gte(schema.lessons.occurrenceCount, 2),
        inArray(schema.lessons.severity, ["critical", "high"])
      )
    );
};

export interface CandidateProject {
  id: string;
}

export const findCandidateProjects = async (
  db: PropagationTx,
  lessonProjectId: string,
  stackTags: string[]
): Promise<CandidateProject[]> => {
  if (stackTags.length === 0) return [];

  const tagsLiteral = sql.raw(
    `ARRAY[${stackTags.map((tag) => `'${tag.replace(/'/g, "''")}'`).join(",")}]::text[]`
  );

  return db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      sql`${schema.projects.id} != ${lessonProjectId} AND ${schema.projects.stackTags} && ${tagsLiteral}`
    );
};

export interface InsertedPropagation {
  id: string;
}

export const insertPropagation = async (
  db: PropagationTx,
  sourceLessonId: string,
  targetProjectId: string
): Promise<InsertedPropagation[]> => {
  return db
    .insert(schema.lessonPropagations)
    .values({
      sourceLessonId,
      targetProjectId,
      status: "suggested",
    })
    .onConflictDoNothing()
    .returning({ id: schema.lessonPropagations.id });
};

export interface PendingPropagation {
  id: string;
  title: string;
  problem: string;
  severity: string | null;
  stackTags: string[] | null;
  occurrenceCount: number | null;
}

export const getPendingPropagations = async (
  db: PropagationTx,
  targetProjectId: string
): Promise<PendingPropagation[]> => {
  return db
    .select({
      id: schema.lessonPropagations.id,
      title: schema.lessons.title,
      problem: schema.lessons.problem,
      severity: schema.lessons.severity,
      stackTags: schema.lessons.stackTags,
      occurrenceCount: schema.lessons.occurrenceCount,
    })
    .from(schema.lessonPropagations)
    .innerJoin(schema.lessons, eq(schema.lessonPropagations.sourceLessonId, schema.lessons.id))
    .where(
      and(
        eq(schema.lessonPropagations.targetProjectId, targetProjectId),
        eq(schema.lessonPropagations.status, "suggested")
      )
    );
};

export interface PropagationRow {
  id: string;
  sourceLessonId: string;
  targetProjectId: string;
  status: string | null;
  suggestedAt: Date | null;
  reviewedAt: Date | null;
}

export const getPropagationById = async (
  db: PropagationTx,
  id: string
): Promise<PropagationRow | undefined> => {
  const rows = await db
    .select({
      id: schema.lessonPropagations.id,
      sourceLessonId: schema.lessonPropagations.sourceLessonId,
      targetProjectId: schema.lessonPropagations.targetProjectId,
      status: schema.lessonPropagations.status,
      suggestedAt: schema.lessonPropagations.suggestedAt,
      reviewedAt: schema.lessonPropagations.reviewedAt,
    })
    .from(schema.lessonPropagations)
    .where(eq(schema.lessonPropagations.id, id))
    .limit(1);

  return rows[0];
};

export const updatePropagationStatus = async (
  db: PropagationTx,
  id: string,
  status: "accepted" | "rejected",
  reviewedAt: Date
): Promise<void> => {
  await db
    .update(schema.lessonPropagations)
    .set({
      status,
      reviewedAt,
    })
    .where(eq(schema.lessonPropagations.id, id));
};
