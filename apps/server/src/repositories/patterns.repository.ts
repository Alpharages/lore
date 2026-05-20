import { and, or, eq, isNull, arrayOverlaps, inArray, sql, count } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export type PatternsTx = NodePgDatabase<typeof schema>;

export interface InsertPatternValues {
  projectId: string;
  repoId?: string | null;
  title: string;
  description: string;
  codeExample?: string | null;
  stackTags: string[];
  category?: string | null;
  usageCount?: number;
  embedding?: number[] | null;
  externalTaskId?: string | null;
  externalTaskRef?: string | null;
  externalTrackerType?: "clickup" | "jira" | "asana" | null;
}

export interface PatternRow {
  id: string;
  projectId: string | null;
  repoId: string | null;
  stackTags: string[] | null;
  category: string | null;
  title: string;
  description: string;
  codeExample: string | null;
  usageCount: number | null;
  lastUsedAt: Date | null;
  embedding: number[] | null;
  externalTaskId: string | null;
  externalTaskRef: string | null;
  externalTrackerType: string | null;
  createdAt: Date | null;
}

export const insertPattern = async (
  db: PatternsTx,
  values: InsertPatternValues
): Promise<{ id: string }> => {
  const [pattern] = await db
    .insert(schema.patterns)
    .values({
      projectId: values.projectId,
      repoId: values.repoId,
      title: values.title,
      description: values.description,
      codeExample: values.codeExample,
      stackTags: values.stackTags,
      category: values.category,
      usageCount: values.usageCount,
      embedding: values.embedding,
      externalTaskId: values.externalTaskId,
      externalTaskRef: values.externalTaskRef,
      externalTrackerType: values.externalTrackerType,
    })
    .returning({ id: schema.patterns.id });
  return { id: pattern.id };
};

export interface GetPatternsFilteredParams {
  stackTags?: string[];
  category?: string | null;
  projectId: string;
  limit: number;
}

// All filter values are bound as query parameters: project/category via the
// query builder, stack_tags via `arrayOverlaps` (parameterised `&&`). Nothing
// is string-interpolated into the SQL, so caller-supplied tags cannot inject.
export const getPatternsFiltered = async (
  db: PatternsTx,
  params: GetPatternsFilteredParams
): Promise<PatternRow[]> => {
  const { stackTags, category, projectId, limit } = params;

  const conditions = [
    or(eq(schema.patterns.projectId, projectId), isNull(schema.patterns.projectId)),
  ];

  if (stackTags && stackTags.length > 0) {
    conditions.push(arrayOverlaps(schema.patterns.stackTags, stackTags));
  }

  if (category) {
    conditions.push(eq(schema.patterns.category, category));
  }

  return db
    .select()
    .from(schema.patterns)
    .where(and(...conditions))
    .orderBy(
      sql`${schema.patterns.usageCount} desc nulls last`,
      sql`${schema.patterns.lastUsedAt} desc nulls last`
    )
    .limit(limit);
};

// Single UPDATE statement; ids are bound via `inArray` (parameterised IN-list).
// No-op (and no statement issued) when the id list is empty.
export interface FindPatternsForUiParams {
  stackTags?: string[];
  category?: string | null;
  projectId?: string | null;
  limit: number;
}

export const findPatternsForUi = async (
  db: PatternsTx,
  params: FindPatternsForUiParams
): Promise<PatternRow[]> => {
  const { stackTags, category, projectId, limit } = params;

  const conditions: any[] = [];

  if (projectId) {
    conditions.push(
      or(eq(schema.patterns.projectId, projectId), isNull(schema.patterns.projectId))
    );
  }

  if (stackTags && stackTags.length > 0) {
    conditions.push(arrayOverlaps(schema.patterns.stackTags, stackTags));
  }

  if (category) {
    conditions.push(eq(schema.patterns.category, category));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(schema.patterns)
    .where(whereClause)
    .orderBy(
      sql`${schema.patterns.usageCount} desc nulls last`,
      sql`${schema.patterns.lastUsedAt} desc nulls last`
    )
    .limit(limit);
};

export const findPatternById = async (
  db: PatternsTx,
  id: string
): Promise<PatternRow | undefined> => {
  const rows = await db.select().from(schema.patterns).where(eq(schema.patterns.id, id)).limit(1);
  return rows[0];
};

export const countPatternsForUi = async (
  db: PatternsTx,
  params: Omit<FindPatternsForUiParams, "limit">
): Promise<number> => {
  const { stackTags, category, projectId } = params;

  const conditions: any[] = [];

  if (projectId) {
    conditions.push(
      or(eq(schema.patterns.projectId, projectId), isNull(schema.patterns.projectId))
    );
  }

  if (stackTags && stackTags.length > 0) {
    conditions.push(arrayOverlaps(schema.patterns.stackTags, stackTags));
  }

  if (category) {
    conditions.push(eq(schema.patterns.category, category));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [result] = await db.select({ count: count() }).from(schema.patterns).where(whereClause);

  return result?.count ?? 0;
};

export const bumpPatternUsage = async (db: PatternsTx, ids: string[]): Promise<PatternRow[]> => {
  if (ids.length === 0) return [];

  return db
    .update(schema.patterns)
    .set({
      usageCount: sql`${schema.patterns.usageCount} + 1`,
      lastUsedAt: sql`now()`,
    })
    .where(inArray(schema.patterns.id, ids))
    .returning();
};
