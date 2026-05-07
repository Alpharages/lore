import { eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

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
