import { internalApiClient } from "./axios";
import type { Lesson, Propagation, Stats, Project, ProjectKeyReference } from "./api-types";

export const login = async (password: string): Promise<void> => {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  } catch {
    throw new Error("Network error");
  }
  if (!res.ok) {
    throw new Error("Incorrect password");
  }
};

export const fetchLessons = async (params: {
  q?: string;
  project?: string;
  tags?: string[];
  severity?: string[];
  category?: string;
  limit?: number;
}): Promise<{ lessons: Lesson[]; total: number }> => {
  const { data } = await internalApiClient.get("/api/lessons/search", {
    params: {
      ...params,
      tags: params.tags?.join(","),
      severity: params.severity?.join(","),
    },
  });
  return {
    lessons: data.lessons as Lesson[],
    total: typeof data.total === "number" ? data.total : data.lessons.length,
  };
};

export const fetchLesson = async (id: string): Promise<Lesson> => {
  const { data } = await internalApiClient.get(`/api/lessons/${id}`);
  return data as Lesson;
};

export const fetchPropagations = async (project?: string): Promise<Propagation[]> => {
  const { data } = await internalApiClient.get("/api/propagations/pending", {
    params: project ? { project } : undefined,
  });
  return data.suggestions as Propagation[];
};

export const acceptPropagation = async (id: string): Promise<void> => {
  await internalApiClient.post(`/api/propagations/${id}/accept`);
};

export const rejectPropagation = async (id: string): Promise<void> => {
  await internalApiClient.post(`/api/propagations/${id}/reject`);
};

export const fetchStats = async (project?: string): Promise<Stats> => {
  const { data } = await internalApiClient.get("/api/stats", {
    params: project ? { project } : undefined,
  });
  return data as Stats;
};

export const fetchProjects = async (): Promise<Project[]> => {
  const { data } = await internalApiClient.get("/api/projects");
  return data.projects as Project[];
};

export const fetchProjectKey = async (slug: string): Promise<ProjectKeyReference> => {
  const { data } = await internalApiClient.get(`/api/projects/${encodeURIComponent(slug)}/key`);
  return data as ProjectKeyReference;
};

export const revokeApiKey = async (slug: string, keyId: string): Promise<void> => {
  await internalApiClient.delete(
    `/api/projects/${encodeURIComponent(slug)}/keys/${encodeURIComponent(keyId)}`
  );
};

export const regenerateApiKey = async (slug: string): Promise<{ key: string; keyId: string }> => {
  const { data } = await internalApiClient.post(
    `/api/projects/${encodeURIComponent(slug)}/keys/regenerate`
  );
  return data as { key: string; keyId: string };
};

export const fetchPropagationCount = async (projectSlug?: string): Promise<number> => {
  const { data } = await internalApiClient.get("/api/propagations/pending", {
    params: projectSlug ? { project: projectSlug } : undefined,
  });
  return (data.suggestions as Propagation[]).length;
};

export const fetchPropagationMetadata = async (
  project?: string
): Promise<{ lastRunAt: string | null }> => {
  const { data } = await internalApiClient.get("/api/propagations/metadata", {
    params: project ? { project } : undefined,
  });
  return data as { lastRunAt: string | null };
};
