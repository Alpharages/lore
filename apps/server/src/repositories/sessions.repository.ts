import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export type SessionsTx = NodePgDatabase<typeof schema>;

export interface InsertSessionValues {
  projectId: string;
  repoId?: string | null;
  branch?: string | null;
  taskSummary?: string | null;
  userHandle?: string | null;
  externalTaskId?: string | null;
  externalTaskRef?: string | null;
  externalTrackerType?: string | null;
  bmadSkill?: string | null;
  bmadWorkflow?: string | null;
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
      externalTaskId: values.externalTaskId ?? null,
      externalTaskRef: values.externalTaskRef ?? null,
      externalTrackerType: values.externalTrackerType ?? null,
      bmadSkill: values.bmadSkill ?? null,
      bmadWorkflow: values.bmadWorkflow ?? null,
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

export interface OpenSession {
  id: string;
  branch: string | null;
  decisions: unknown[];
  filesTouched: string[];
  startedAt: Date | null;
  endedAt: Date | null;
}

export const findOpenSessionByTask = async (
  db: SessionsTx,
  projectId: string,
  externalTaskId: string,
  externalTrackerType: string
): Promise<OpenSession | undefined> => {
  const rows = await db
    .select({
      id: schema.sessions.id,
      branch: schema.sessions.branch,
      decisions: schema.sessions.decisions,
      filesTouched: schema.sessions.filesTouched,
      startedAt: schema.sessions.startedAt,
      endedAt: schema.sessions.endedAt,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.projectId, projectId),
        eq(schema.sessions.externalTaskId, externalTaskId),
        eq(schema.sessions.externalTrackerType, externalTrackerType),
        isNull(schema.sessions.endedAt)
      )
    )
    .orderBy(sql`${schema.sessions.startedAt} DESC`)
    .limit(1);

  if (rows.length === 0) return undefined;

  const row = rows[0];
  return {
    id: row.id,
    branch: row.branch,
    decisions: (row.decisions as unknown[]) ?? [],
    filesTouched: row.filesTouched ?? [],
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
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

export const linkLessonsToOpenSession = async (
  db: SessionsTx,
  externalTaskId: string,
  consulted: string[],
  applied: string[]
): Promise<{ updated: boolean }> => {
  const consultedLiteral = sql.raw(
    `ARRAY[${consulted.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::uuid[]`
  );
  const appliedLiteral = sql.raw(
    `ARRAY[${applied.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::uuid[]`
  );

  const result = await db.execute(
    sql`
      UPDATE sessions SET
        lessons_consulted = ARRAY(SELECT DISTINCT unnest(COALESCE(lessons_consulted, ARRAY[]::uuid[]) || ${consultedLiteral})),
        lessons_applied   = ARRAY(SELECT DISTINCT unnest(COALESCE(lessons_applied, ARRAY[]::uuid[]) || ${appliedLiteral}))
      WHERE id = (
        SELECT id FROM sessions
        WHERE external_task_id = ${externalTaskId} AND ended_at IS NULL
        ORDER BY started_at DESC LIMIT 1
      )
      RETURNING id
    `
  );
  const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
  return { updated: rows.length > 0 };
};
