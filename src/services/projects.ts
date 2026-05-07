import { eq } from "drizzle-orm";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { generateApiKey, hashApiKey } from "./api-key.js";

export type DrizzleClient = NodePgDatabase<typeof schema>;

export interface RegisterProjectInput {
  name: string;
  slug: string;
  stackTags?: string[];
  repos?: Array<{ slug: string; name?: string; stackTags?: string[] }>;
}

export interface RegisterProjectOutput {
  projectId: string;
  apiKey: string;
}

export async function registerProject(
  db: DrizzleClient,
  input: RegisterProjectInput
): Promise<RegisterProjectOutput> {
  const plainKey = generateApiKey(input.slug);
  const hashed = await hashApiKey(plainKey);

  const result = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(schema.projects)
      .values({
        slug: input.slug,
        name: input.name,
        apiKeyHash: hashed,
        stackTags: input.stackTags ?? [],
      })
      .returning({ id: schema.projects.id });

    if (input.repos && input.repos.length > 0) {
      await tx.insert(schema.repositories).values(
        input.repos.map((repo) => ({
          projectId: project.id,
          slug: repo.slug,
          name: repo.name ?? repo.slug,
          stackTags: repo.stackTags ?? [],
        }))
      );
    }

    return { projectId: project.id, apiKey: plainKey };
  });

  return result;
}

export async function listProjects(db: DrizzleClient) {
  return db
    .select({
      id: schema.projects.id,
      slug: schema.projects.slug,
      name: schema.projects.name,
      stackTags: schema.projects.stackTags,
      createdAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .orderBy(schema.projects.createdAt);
}

export async function deleteProjectBySlug(
  db: DrizzleClient,
  slug: string
): Promise<boolean> {
  const result = await db
    .delete(schema.projects)
    .where(eq(schema.projects.slug, slug))
    .returning({ id: schema.projects.id });

  return result.length > 0;
}

export async function findProjectBySlug(
  db: DrizzleClient,
  slug: string
): Promise<{ id: string; slug: string; apiKeyHash: string } | undefined> {
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
}

