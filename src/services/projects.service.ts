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

export const registerProject = async (
  db: DrizzleClient,
  input: RegisterProjectInput
): Promise<RegisterProjectOutput> => {
  const plainKey = generateApiKey(input.slug);
  const hashed = await hashApiKey(plainKey);

  const result = await db.transaction(async (tx) => {
    const project = await projectsRepo.insertProject(tx, {
      slug: input.slug,
      name: input.name,
      apiKeyHash: hashed,
      stackTags: input.stackTags ?? [],
    });

    if (input.repos && input.repos.length > 0) {
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
): Promise<{ id: string; slug: string; apiKeyHash: string } | undefined> => {
  return projectsRepo.findProjectBySlug(db, slug);
};
