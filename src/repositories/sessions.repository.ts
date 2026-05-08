import { eq, and, inArray, isNull } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export type SessionsTx = NodePgDatabase<typeof schema>;

export interface InsertSessionValues {
  projectId: string;
  repoId?: string | null;
  branch?: string | null;
  taskSummary?: string | null;
  userHandle?: string | null;
}

export const insertSession = async (
  db: SessionsTx,
  values: InsertSessionValues
): Promise<{ id: string; startedAt: Date | null }> => {
  const [session] = await db
    .insert(schema.sessions)
    .values({
      projectId: values.projectId,
      repoId: values.repoId ?? null,
      branch: values.branch ?? null,
      taskSummary: values.taskSummary ?? null,
      userHandle: values.userHandle ?? null,
    })
    .returning({
      id: schema.sessions.id,
      startedAt: schema.sessions.startedAt,
    });
  return session;
};

export const findSessionById = async (
  db: SessionsTx,
  id: string,
  projectId?: string
): Promise<
  | {
      id: string;
      projectId: string;
      startedAt: Date | null;
      endedAt: Date | null;
    }
  | undefined
> => {
  const conditions = [eq(schema.sessions.id, id)];
  if (projectId) {
    conditions.push(eq(schema.sessions.projectId, projectId));
  }

  const rows = await db
    .select({
      id: schema.sessions.id,
      projectId: schema.sessions.projectId,
      startedAt: schema.sessions.startedAt,
      endedAt: schema.sessions.endedAt,
    })
    .from(schema.sessions)
    .where(and(...conditions))
    .limit(1);

  return rows[0];
};

export interface EndSessionUpdate {
  decisions?: unknown[];
  lessonsApplied?: string[];
  filesTouched?: string[];
  endedAt?: Date;
}

export const updateSessionEnd = async (
  db: SessionsTx,
  sessionId: string,
  projectId: string,
  update: EndSessionUpdate
): Promise<{ id: string } | undefined> => {
  const endedAt = update.endedAt ?? new Date();
  const [result] = await db
    .update(schema.sessions)
    .set({
      endedAt,
      decisions: update.decisions ?? [],
      lessonsApplied: update.lessonsApplied ?? [],
      filesTouched: update.filesTouched ?? [],
    })
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.projectId, projectId),
        isNull(schema.sessions.endedAt)
      )
    )
    .returning({ id: schema.sessions.id });

  return result;
};

/** Count lessons matching ids (caller passes deduplicated ids). */
export const countLessonsByIds = async (db: SessionsTx, ids: string[]): Promise<number> => {
  if (ids.length === 0) return 0;
  const rows = await db
    .select({ id: schema.lessons.id })
    .from(schema.lessons)
    .where(inArray(schema.lessons.id, ids));
  return rows.length;
};
