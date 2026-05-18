import { and, eq, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export type StatsTx = NodePgDatabase<typeof schema>;

export interface AggregateCounts {
  totalLessons: number;
  sessionsRun: number;
  propagationsSent: number;
  propagationsAccepted: number;
}

export interface WeeklyLessonPoint {
  week: string;
  count: number;
}

export interface PropagationMetadataRow {
  lastRunAt: string | null;
}

const resolveProjectId = async (db: StatsTx, projectSlug: string): Promise<string | null> => {
  const rows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.slug, projectSlug))
    .limit(1);
  return rows[0]?.id ?? null;
};

export const getAggregateCounts = async (
  db: StatsTx,
  projectSlug?: string
): Promise<AggregateCounts> => {
  let projectId: string | null = null;
  if (projectSlug) {
    projectId = await resolveProjectId(db, projectSlug);
    if (!projectId) {
      return {
        totalLessons: 0,
        sessionsRun: 0,
        propagationsSent: 0,
        propagationsAccepted: 0,
      };
    }
  }

  const lessonsQuery = db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.lessons);
  if (projectId) lessonsQuery.where(eq(schema.lessons.projectId, projectId));

  const sessionsQuery = db.select({ count: sql<number>`COUNT(*)::int` }).from(schema.sessions);
  if (projectId) sessionsQuery.where(eq(schema.sessions.projectId, projectId));

  const sentQuery = db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(schema.lessonPropagations);
  if (projectId) sentQuery.where(eq(schema.lessonPropagations.targetProjectId, projectId));

  const acceptedQuery = db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(schema.lessonPropagations);
  if (projectId) {
    acceptedQuery.where(
      and(
        eq(schema.lessonPropagations.targetProjectId, projectId),
        eq(schema.lessonPropagations.status, "accepted")
      )
    );
  } else {
    acceptedQuery.where(eq(schema.lessonPropagations.status, "accepted"));
  }

  const [[lessonsRow], [sessionsRow], [sentRow], [acceptedRow]] = await Promise.all([
    lessonsQuery,
    sessionsQuery,
    sentQuery,
    acceptedQuery,
  ]);

  return {
    totalLessons: Number(lessonsRow?.count ?? 0),
    sessionsRun: Number(sessionsRow?.count ?? 0),
    propagationsSent: Number(sentRow?.count ?? 0),
    propagationsAccepted: Number(acceptedRow?.count ?? 0),
  };
};

export const getWeeklyLessonCounts = async (
  db: StatsTx,
  projectSlug?: string,
  weeks = 12
): Promise<WeeklyLessonPoint[]> => {
  let projectId: string | null = null;
  if (projectSlug) {
    projectId = await resolveProjectId(db, projectSlug);
    if (!projectId) return [];
  }

  const rows = projectId
    ? await db.execute(sql`
        SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
               COUNT(*)::int AS count
        FROM lessons
        WHERE project_id = ${projectId}
          AND created_at >= NOW() - (${weeks}::int * INTERVAL '1 week')
        GROUP BY week
        ORDER BY week
      `)
    : await db.execute(sql`
        SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
               COUNT(*)::int AS count
        FROM lessons
        WHERE created_at >= NOW() - (${weeks}::int * INTERVAL '1 week')
        GROUP BY week
        ORDER BY week
      `);

  const dataset = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
  return (dataset as Array<{ week: string; count: number }>).map((r) => ({
    week: r.week,
    count: Number(r.count),
  }));
};

export const getPropagationMetadata = async (
  db: StatsTx,
  projectSlug?: string
): Promise<PropagationMetadataRow> => {
  let projectId: string | null = null;
  if (projectSlug) {
    projectId = await resolveProjectId(db, projectSlug);
    if (!projectId) return { lastRunAt: null };
  }

  const rows = projectId
    ? await db
        .select({
          lastRunAt: sql<string | null>`MAX(${schema.lessonPropagations.suggestedAt})`,
        })
        .from(schema.lessonPropagations)
        .where(eq(schema.lessonPropagations.targetProjectId, projectId))
    : await db
        .select({
          lastRunAt: sql<string | null>`MAX(${schema.lessonPropagations.suggestedAt})`,
        })
        .from(schema.lessonPropagations);

  const value = rows[0]?.lastRunAt ?? null;
  return { lastRunAt: value ? new Date(value).toISOString() : null };
};

export interface AdminPendingPropagation {
  id: string;
  lessonId: string;
  lessonTitle: string;
  problem: string;
  severity: string | null;
  stackTags: string[];
  occurrenceCount: number;
  sharedStackTags: string[];
  sourceProject: string;
  trustTier: "high" | "medium" | "low";
  createdAt: string;
  targetProject: string;
}

export const getAdminPendingPropagations = async (
  db: StatsTx,
  projectSlug?: string
): Promise<AdminPendingPropagation[]> => {
  let projectId: string | null = null;
  if (projectSlug) {
    projectId = await resolveProjectId(db, projectSlug);
    if (!projectId) return [];
  }

  const sourceProjects = schema.projects;
  const baseQuery = db
    .select({
      id: schema.lessonPropagations.id,
      lessonId: schema.lessons.id,
      lessonTitle: schema.lessons.title,
      problem: schema.lessons.problem,
      severity: schema.lessons.severity,
      stackTags: schema.lessons.stackTags,
      occurrenceCount: schema.lessons.occurrenceCount,
      sourceProjectName: sourceProjects.name,
      sourceProjectStackTags: sourceProjects.stackTags,
      targetProjectSlug: sql<string>`tp.slug`,
      targetProjectStackTags: sql<string[]>`tp.stack_tags`,
      createdAt: schema.lessonPropagations.suggestedAt,
    })
    .from(schema.lessonPropagations)
    .innerJoin(schema.lessons, eq(schema.lessonPropagations.sourceLessonId, schema.lessons.id))
    .innerJoin(sourceProjects, eq(sourceProjects.id, schema.lessons.projectId))
    .innerJoin(
      sql`${schema.projects} AS tp`,
      sql`tp.id = ${schema.lessonPropagations.targetProjectId}`
    );

  const rows = projectId
    ? await baseQuery.where(
        and(
          eq(schema.lessonPropagations.status, "suggested"),
          eq(schema.lessonPropagations.targetProjectId, projectId)
        )
      )
    : await baseQuery.where(eq(schema.lessonPropagations.status, "suggested"));

  return rows.map((r) => {
    const lessonTags = r.stackTags ?? [];
    const targetTags = r.targetProjectStackTags ?? [];
    const shared = lessonTags.filter((t: string) => targetTags.includes(t));
    const trust: "high" | "medium" | "low" =
      shared.length >= 3 ? "high" : shared.length === 2 ? "medium" : "low";
    return {
      id: r.id,
      lessonId: r.lessonId,
      lessonTitle: r.lessonTitle,
      problem: r.problem,
      severity: r.severity,
      stackTags: lessonTags,
      occurrenceCount: r.occurrenceCount ?? 0,
      sharedStackTags: shared,
      sourceProject: r.sourceProjectName,
      trustTier: trust,
      createdAt: r.createdAt ? new Date(r.createdAt as unknown as string | Date).toISOString() : "",
      targetProject: r.targetProjectSlug,
    };
  });
};
