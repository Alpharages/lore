import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { DrizzleClient } from "../repositories/projects.repository.js";
import * as projectsRepo from "../repositories/projects.repository.js";
import { generateApiKey, hashApiKey } from "./api-key.js";

export type { DrizzleClient } from "../repositories/projects.repository.js";

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

const MASKED_KEY_BULLETS = "•".repeat(24);

const maskKey = (slug: string): string => `lore_${slug}_${MASKED_KEY_BULLETS}`;

export const registerProject = async (
  db: DrizzleClient,
  input: RegisterProjectInput
): Promise<RegisterProjectOutput> => {
  const plainKey = generateApiKey(input.slug);
  const hashed = await hashApiKey(plainKey);
  const apiKeyId = randomUUID();

  const result = await db.transaction(async (tx) => {
    const project = await projectsRepo.insertProject(tx, {
      slug: input.slug,
      name: input.name,
      apiKeyId,
      apiKeyHash: hashed,
      stackTags: input.stackTags ?? [],
    });

    if (input.repos && input.repos.length > 0) {
      await tx.execute(sql`SELECT set_config('app.current_project_id', ${project.id}, true)`);
      await projectsRepo.insertRepositories(
        tx,
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
};

export const listProjects = async (db: DrizzleClient) => {
  return projectsRepo.selectProjects(db);
};

export const deleteProjectBySlug = async (db: DrizzleClient, slug: string): Promise<boolean> => {
  return projectsRepo.deleteProjectBySlug(db, slug);
};

export const findProjectBySlug = async (
  db: DrizzleClient,
  slug: string
): Promise<{ id: string; slug: string; apiKeyHash: string | null } | undefined> => {
  return projectsRepo.findProjectBySlug(db, slug);
};

export interface ProjectKeyReference {
  keyId: string | null;
  maskedKey: string | null;
}

export const getProjectKeyReference = async (
  db: DrizzleClient,
  slug: string
): Promise<ProjectKeyReference | null> => {
  const row = await projectsRepo.findProjectKeyBySlug(db, slug);
  if (!row) {
    return null;
  }
  return {
    keyId: row.keyId,
    maskedKey: row.keyId ? maskKey(slug) : null,
  };
};

export const revokeProjectKey = async (
  db: DrizzleClient,
  slug: string,
  keyId: string
): Promise<boolean> => {
  return projectsRepo.revokeProjectKey(db, slug, keyId);
};

export interface RegenerateProjectKeyOutput {
  key: string;
  keyId: string;
}

export const regenerateProjectKey = async (
  db: DrizzleClient,
  slug: string
): Promise<RegenerateProjectKeyOutput | null> => {
  const plainKey = generateApiKey(slug);
  const hashed = await hashApiKey(plainKey);
  const apiKeyId = randomUUID();

  const updated = await projectsRepo.updateProjectKey(db, slug, {
    apiKeyId,
    apiKeyHash: hashed,
  });

  if (!updated) {
    return null;
  }

  return { key: plainKey, keyId: apiKeyId };
};
