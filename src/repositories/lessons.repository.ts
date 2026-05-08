import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
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

export interface SimilarLessonResult {
  id: string;
  title: string;
  problem: string;
  fix: string;
  preventionRule: string;
  stackTags: string[] | null;
  category: string | null;
  severity: string | null;
  occurrenceCount: number | null;
  similarity: number;
}

export const searchSimilarLessons = async (
  db: LessonsTx,
  embedding: number[],
  threshold: number,
  limit: number,
  projectId: string
): Promise<SimilarLessonResult[]> => {
  const vectorParam = `[${embedding.join(",")}]`;

  const result = await db.execute(
    sql`
      SELECT id, title, problem, fix, prevention_rule, stack_tags,
             category, severity, occurrence_count,
             1 - (embedding <=> ${vectorParam}::vector) AS similarity
      FROM ${schema.lessons}
      WHERE (project_id = ${projectId}::uuid OR project_id IS NULL)
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorParam}::vector) >= ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `
  );

  const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);

  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    title: String(row.title),
    problem: String(row.problem),
    fix: String(row.fix),
    preventionRule: String(row.prevention_rule),
    stackTags: Array.isArray(row.stack_tags) ? (row.stack_tags as string[]) : null,
    category: row.category ? String(row.category) : null,
    severity: row.severity ? String(row.severity) : null,
    occurrenceCount: row.occurrence_count ? Number(row.occurrence_count) : null,
    similarity: Number(row.similarity),
  }));
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

export interface QueryLessonsParams {
  stackTags?: string[];
  category?: string;
  severity?: "critical" | "high" | "medium" | "low";
  lastNDays?: number;
  repoId?: string | null;
  limit: number;
}

export interface LessonRow {
  id: string;
  title: string;
  problem: string;
  rootCause: string | null;
  fix: string;
  preventionRule: string;
  stackTags: string[] | null;
  category: string | null;
  severity: string | null;
  occurrenceCount: number | null;
  lastSeenAt: Date | null;
  firstSeenAt: Date | null;
  projectId: string | null;
}

export const queryLessons = async (
  db: LessonsTx,
  params: QueryLessonsParams
): Promise<LessonRow[]> => {
  const conditions: SQL[] = [];

  if (params.stackTags && params.stackTags.length > 0) {
    const tagsLiteral = sql.raw(
      `ARRAY[${params.stackTags.map((tag) => `'${tag.replace(/'/g, "''")}'`).join(",")}]::text[]`
    );
    conditions.push(sql`${schema.lessons.stackTags} && ${tagsLiteral}`);
  }

  if (params.category) {
    conditions.push(eq(schema.lessons.category, params.category));
  }

  if (params.severity) {
    conditions.push(eq(schema.lessons.severity, params.severity));
  }

  if (params.lastNDays) {
    const cutoff = new Date(Date.now() - params.lastNDays * 86_400_000);
    conditions.push(gte(schema.lessons.lastSeenAt, cutoff));
  }

  if (params.repoId) {
    conditions.push(eq(schema.lessons.repoId, params.repoId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select({
      id: schema.lessons.id,
      title: schema.lessons.title,
      problem: schema.lessons.problem,
      rootCause: schema.lessons.rootCause,
      fix: schema.lessons.fix,
      preventionRule: schema.lessons.preventionRule,
      stackTags: schema.lessons.stackTags,
      category: schema.lessons.category,
      severity: schema.lessons.severity,
      occurrenceCount: schema.lessons.occurrenceCount,
      lastSeenAt: schema.lessons.lastSeenAt,
      firstSeenAt: schema.lessons.firstSeenAt,
      projectId: schema.lessons.projectId,
    })
    .from(schema.lessons)
    .where(whereClause)
    .orderBy(desc(schema.lessons.lastSeenAt))
    .limit(params.limit);
};

/* ------------------------------------------------------------------
 * query_lessons_for_task — repository layer
 * ------------------------------------------------------------------ */

export interface RawLessonForTaskRow {
  id: string;
  title: string;
  problem: string;
  rootCause: string | null;
  fix: string;
  preventionRule: string;
  stackTags: string[] | null;
  category: string | null;
  severity: string | null;
  occurrenceCount: number | null;
  lastSeenAt: Date | null;
  similarity: number;
  matchReason: string;
}

export interface FindLessonsForTaskParams {
  projectId: string;
  /** Lessons whose `external_task_id` matches this tracker task (same work item). */
  externalTaskId?: string;
  queryEmbedding?: number[] | null;
  stackTags?: string[];
  parentEpicId?: string;
  limit: number;
}

/** When cosine similarity ties, prefer richer match explanations for deduplication. */
const LESSON_FOR_TASK_MATCH_RANK: Record<string, number> = {
  semantic: 4,
  task: 3,
  stack: 2,
  "epic-sibling": 1,
};

const pickBetterLessonForTaskRow = (
  a: RawLessonForTaskRow,
  b: RawLessonForTaskRow
): RawLessonForTaskRow => {
  if (b.similarity > a.similarity) return b;
  if (b.similarity < a.similarity) return a;
  const ra = LESSON_FOR_TASK_MATCH_RANK[a.matchReason] ?? 0;
  const rb = LESSON_FOR_TASK_MATCH_RANK[b.matchReason] ?? 0;
  return rb > ra ? b : a;
};

const PATTERN_FOR_TASK_MATCH_RANK: Record<string, number> = {
  semantic: 2,
  stack: 1,
};

const pickBetterPatternForTaskRow = (
  a: PatternForTaskRow,
  b: PatternForTaskRow
): PatternForTaskRow => {
  if (b.similarity > a.similarity) return b;
  if (b.similarity < a.similarity) return a;
  const ra = PATTERN_FOR_TASK_MATCH_RANK[a.matchReason] ?? 0;
  const rb = PATTERN_FOR_TASK_MATCH_RANK[b.matchReason] ?? 0;
  return rb > ra ? b : a;
};

const normalizeLessonForTaskRow = (r: Record<string, unknown>): RawLessonForTaskRow => ({
  id: String(r.id),
  title: String(r.title),
  problem: String(r.problem),
  rootCause: r.root_cause ? String(r.root_cause) : null,
  fix: String(r.fix),
  preventionRule: String(r.prevention_rule),
  stackTags: Array.isArray(r.stack_tags) ? (r.stack_tags as string[]) : null,
  category: r.category ? String(r.category) : null,
  severity: r.severity ? String(r.severity) : null,
  occurrenceCount: r.occurrence_count ? Number(r.occurrence_count) : null,
  lastSeenAt: r.last_seen_at ? new Date(String(r.last_seen_at)) : null,
  similarity: Number(r.similarity),
  matchReason: String(r.match_reason),
});

export const findLessonsForTask = async (
  db: LessonsTx,
  params: FindLessonsForTaskParams
): Promise<RawLessonForTaskRow[]> => {
  const { projectId, externalTaskId, queryEmbedding, stackTags, parentEpicId, limit } = params;
  const branches: Promise<RawLessonForTaskRow[]>[] = [];

  if (queryEmbedding) {
    const vectorParam = `[${queryEmbedding.join(",")}]`;
    branches.push(
      (async () => {
        const result = await db.execute(
          sql`
            SELECT id, title, problem, root_cause, fix, prevention_rule,
                   stack_tags, category, severity, occurrence_count, last_seen_at,
                   1 - (embedding <=> ${vectorParam}::vector) AS similarity,
                   'semantic' AS match_reason
            FROM ${schema.lessons}
            WHERE (project_id = ${projectId}::uuid OR project_id IS NULL)
              AND embedding IS NOT NULL
              AND 1 - (embedding <=> ${vectorParam}::vector) >= 0.65
            ORDER BY similarity DESC
            LIMIT ${limit}
          `
        );
        const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
        return rows.map((row: Record<string, unknown>) => normalizeLessonForTaskRow(row));
      })()
    );
  }

  if (externalTaskId) {
    branches.push(
      (async () => {
        const result = await db.execute(
          sql`
            SELECT id, title, problem, root_cause, fix, prevention_rule,
                   stack_tags, category, severity, occurrence_count, last_seen_at,
                   0 AS similarity,
                   'task' AS match_reason
            FROM ${schema.lessons}
            WHERE (project_id = ${projectId}::uuid OR project_id IS NULL)
              AND external_task_id = ${externalTaskId}
            ORDER BY occurrence_count DESC NULLS LAST, last_seen_at DESC NULLS LAST
            LIMIT ${limit}
          `
        );
        const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
        return rows.map((row: Record<string, unknown>) => normalizeLessonForTaskRow(row));
      })()
    );
  }

  if (stackTags && stackTags.length > 0) {
    const tagsLiteral = sql.raw(
      `ARRAY[${stackTags.map((tag) => `'${tag.replace(/'/g, "''")}'`).join(",")}]::text[]`
    );
    branches.push(
      (async () => {
        const result = await db.execute(
          sql`
            SELECT id, title, problem, root_cause, fix, prevention_rule,
                   stack_tags, category, severity, occurrence_count, last_seen_at,
                   0 AS similarity,
                   'stack' AS match_reason
            FROM ${schema.lessons}
            WHERE (project_id = ${projectId}::uuid OR project_id IS NULL)
              AND stack_tags && ${tagsLiteral}
            ORDER BY occurrence_count DESC NULLS LAST, last_seen_at DESC NULLS LAST
            LIMIT ${limit}
          `
        );
        const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
        return rows.map((row: Record<string, unknown>) => normalizeLessonForTaskRow(row));
      })()
    );
  }

  if (parentEpicId) {
    branches.push(
      (async () => {
        const result = await db.execute(
          sql`
            SELECT id, title, problem, root_cause, fix, prevention_rule,
                   stack_tags, category, severity, occurrence_count, last_seen_at,
                   0 AS similarity,
                   'epic-sibling' AS match_reason
            FROM ${schema.lessons}
            WHERE (project_id = ${projectId}::uuid OR project_id IS NULL)
              AND external_task_id = ${parentEpicId}
            ORDER BY occurrence_count DESC NULLS LAST, last_seen_at DESC NULLS LAST
            LIMIT ${limit}
          `
        );
        const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
        return rows.map((row: Record<string, unknown>) => normalizeLessonForTaskRow(row));
      })()
    );
  }

  if (branches.length === 0) {
    return [];
  }

  const resultArrays = await Promise.all(branches);
  const results = resultArrays.flat();

  const seen = new Map<string, RawLessonForTaskRow>();
  for (const row of results) {
    const existing = seen.get(row.id);
    if (!existing) {
      seen.set(row.id, row);
    } else {
      seen.set(row.id, pickBetterLessonForTaskRow(existing, row));
    }
  }

  return Array.from(seen.values());
};

export interface PatternForTaskRow {
  id: string;
  title: string;
  description: string;
  codeExample: string | null;
  stackTags: string[] | null;
  category: string | null;
  usageCount: number | null;
  lastUsedAt: Date | null;
  similarity: number;
  matchReason: string;
}

export interface FindPatternsForTaskParams {
  projectId: string;
  stackTags?: string[];
  queryEmbedding?: number[] | null;
  limit: number;
}

const normalizePatternForTaskRow = (r: Record<string, unknown>): PatternForTaskRow => ({
  id: String(r.id),
  title: String(r.title),
  description: String(r.description),
  codeExample: r.code_example ? String(r.code_example) : null,
  stackTags: Array.isArray(r.stack_tags) ? (r.stack_tags as string[]) : null,
  category: r.category ? String(r.category) : null,
  usageCount: r.usage_count ? Number(r.usage_count) : null,
  lastUsedAt: r.last_used_at ? new Date(String(r.last_used_at)) : null,
  similarity: Number(r.similarity),
  matchReason: String(r.match_reason),
});

export const findPatternsForTask = async (
  db: LessonsTx,
  params: FindPatternsForTaskParams
): Promise<PatternForTaskRow[]> => {
  const { projectId, stackTags, queryEmbedding, limit } = params;
  const branches: Promise<PatternForTaskRow[]>[] = [];

  if (queryEmbedding) {
    const vectorParam = `[${queryEmbedding.join(",")}]`;
    branches.push(
      (async () => {
        const result = await db.execute(
          sql`
            SELECT id, title, description, code_example, stack_tags, category,
                   usage_count, last_used_at,
                   1 - (embedding <=> ${vectorParam}::vector) AS similarity,
                   'semantic' AS match_reason
            FROM ${schema.patterns}
            WHERE (project_id = ${projectId}::uuid OR project_id IS NULL)
              AND embedding IS NOT NULL
              AND 1 - (embedding <=> ${vectorParam}::vector) >= 0.65
            ORDER BY similarity DESC
            LIMIT ${limit}
          `
        );
        const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
        return rows.map((row: Record<string, unknown>) => normalizePatternForTaskRow(row));
      })()
    );
  }

  if (stackTags && stackTags.length > 0) {
    const tagsLiteral = sql.raw(
      `ARRAY[${stackTags.map((tag) => `'${tag.replace(/'/g, "''")}'`).join(",")}]::text[]`
    );
    branches.push(
      (async () => {
        const result = await db.execute(
          sql`
            SELECT id, title, description, code_example, stack_tags, category,
                   usage_count, last_used_at,
                   0 AS similarity,
                   'stack' AS match_reason
            FROM ${schema.patterns}
            WHERE (project_id = ${projectId}::uuid OR project_id IS NULL)
              AND stack_tags && ${tagsLiteral}
            ORDER BY usage_count DESC NULLS LAST, last_used_at DESC NULLS LAST
            LIMIT ${limit}
          `
        );
        const rows = (result as any).rows ?? (Array.isArray(result) ? result : []);
        return rows.map((row: Record<string, unknown>) => normalizePatternForTaskRow(row));
      })()
    );
  }

  if (branches.length === 0) {
    return [];
  }

  const resultArrays = await Promise.all(branches);
  const results = resultArrays.flat();

  const seen = new Map<string, PatternForTaskRow>();
  for (const row of results) {
    const existing = seen.get(row.id);
    if (!existing) {
      seen.set(row.id, row);
    } else {
      seen.set(row.id, pickBetterPatternForTaskRow(existing, row));
    }
  }

  return Array.from(seen.values());
};
