import { apiClient, internalApiClient } from "./axios";
import type { Lesson, Propagation, Stats, Project } from "./api-types";

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
}): Promise<Lesson[]> => {
  const { data } = await internalApiClient.get("/api/lessons/search", {
    params: {
      ...params,
      tags: params.tags?.join(","),
      severity: params.severity?.join(","),
    },
  });
  return data.lessons as Lesson[];
};

export const fetchLesson = async (id: string): Promise<Lesson> => {
  const { data } = await internalApiClient.get(`/api/lessons/${id}`);
  return data as Lesson;
};

export const fetchPropagations = async (project?: string): Promise<Propagation[]> => {
  const { data } = await apiClient.get("/api/propagations/pending", {
    params: project ? { project } : undefined,
  });
  return data.suggestions as Propagation[];
};

export const acceptPropagation = async (id: string): Promise<void> => {
  await apiClient.post(`/api/propagations/${id}/accept`);
};

export const rejectPropagation = async (id: string): Promise<void> => {
  await apiClient.post(`/api/propagations/${id}/reject`);
};

export const fetchStats = async (project?: string): Promise<Stats> => {
  const { data } = await apiClient.get("/api/stats", {
    params: project ? { project } : undefined,
  });
  return data as Stats;
};

export const fetchProjects = async (): Promise<Project[]> => {
  const { data } = await apiClient.get("/api/projects");
  return data.projects as Project[];
};

export const revokeApiKey = async (slug: string, keyId: string): Promise<void> => {
  await apiClient.delete(`/api/projects/${slug}/keys/${keyId}`);
};

export const regenerateApiKey = async (slug: string): Promise<{ key: string }> => {
  const { data } = await apiClient.post(`/api/projects/${slug}/keys/regenerate`);
  return data as { key: string };
};

export const fetchPropagationCount = async (projectSlug?: string): Promise<number> => {
  const { data } = await apiClient.get("/api/propagations/pending", {
    params: projectSlug ? { project: projectSlug } : undefined,
  });
  return (data.suggestions as Propagation[]).length;
};
