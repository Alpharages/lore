import { and, eq, sql } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";

export type DrizzleClient = NodePgDatabase<typeof schema>;

export const insertProject = async (
  db: DrizzleClient,
  values: {
    slug: string;
    name: string;
    apiKeyId: string;
    apiKeyHash: string;
    stackTags: string[];
  }
): Promise<{ id: string }> => {
  const [project] = await db
    .insert(schema.projects)
    .values(values)
    .returning({ id: schema.projects.id });
  return project;
};

export const insertRepositories = async (
  db: DrizzleClient,
  values: Array<{ projectId: string; slug: string; name: string; stackTags: string[] }>
): Promise<void> => {
  await db.insert(schema.repositories).values(values);
};

export const selectProjects = async (db: DrizzleClient) => {
  return db
    .select({
      id: schema.projects.id,
      slug: schema.projects.slug,
      name: schema.projects.name,
      stackTags: schema.projects.stackTags,
      createdAt: schema.projects.createdAt,
      keyId: schema.projects.apiKeyId,
      lessonCount: sql<number>`COUNT(${schema.lessons.id})::int`,
    })
    .from(schema.projects)
    .leftJoin(schema.lessons, eq(schema.lessons.projectId, schema.projects.id))
    .groupBy(schema.projects.id)
    .orderBy(schema.projects.createdAt);
};

export const deleteProjectBySlug = async (db: DrizzleClient, slug: string): Promise<boolean> => {
  const result = await db
    .delete(schema.projects)
    .where(eq(schema.projects.slug, slug))
    .returning({ id: schema.projects.id });

  return result.length > 0;
};

export const findProjectBySlug = async (
  db: DrizzleClient,
  slug: string
): Promise<{ id: string; slug: string; apiKeyHash: string | null } | undefined> => {
  const rows = await db
    .select({
      id: schema.projects.id,
      slug: schema.projects.slug,
      apiKeyHash: schema.projects.apiKeyHash,
    })
    .from(schema.projects)
    .where(eq(schema.projects.slug, slug))
    .limit(1);

  return rows[0];
};

export const findProjectKeyBySlug = async (
  db: DrizzleClient,
  slug: string
): Promise<{ keyId: string | null } | undefined> => {
  const rows = await db
    .select({
      keyId: schema.projects.apiKeyId,
    })
    .from(schema.projects)
    .where(eq(schema.projects.slug, slug))
    .limit(1);

  return rows[0];
};

export const updateProjectKey = async (
  db: DrizzleClient,
  slug: string,
  values: { apiKeyId: string | null; apiKeyHash: string | null }
): Promise<boolean> => {
  const result = await db
    .update(schema.projects)
    .set(values)
    .where(eq(schema.projects.slug, slug))
    .returning({ id: schema.projects.id });

  return result.length > 0;
};

export const revokeProjectKey = async (
  db: DrizzleClient,
  slug: string,
  keyId: string
): Promise<boolean> => {
  const result = await db
    .update(schema.projects)
    .set({ apiKeyId: null, apiKeyHash: null })
    .where(and(eq(schema.projects.slug, slug), eq(schema.projects.apiKeyId, keyId)))
    .returning({ id: schema.projects.id });

  return result.length > 0;
};

export const findRepositoryBySlug = async (
  db: DrizzleClient,
  slug: string
): Promise<{ id: string; slug: string; projectId: string } | undefined> => {
  const rows = await db
    .select({
      id: schema.repositories.id,
      slug: schema.repositories.slug,
      projectId: schema.repositories.projectId,
    })
    .from(schema.repositories)
    .where(eq(schema.repositories.slug, slug))
    .limit(1);

  return rows[0];
};
