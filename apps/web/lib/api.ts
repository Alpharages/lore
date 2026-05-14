export interface Project {
  id: string;
  name: string;
  slug: string;
  stackTags: string[];
}

const apiUrl = process.env.NEXT_PUBLIC_LORE_API_URL;

export const fetchProjects = async (): Promise<Project[]> => {
  const res = await fetch(`${apiUrl}/api/projects`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch projects");
  const data = (await res.json()) as { projects: Project[] };
  return data.projects;
};

export const fetchPropagationCount = async (projectSlug?: string): Promise<number> => {
  const params = new URLSearchParams();
  if (projectSlug) params.set("project", projectSlug);
  const res = await fetch(`${apiUrl}/api/propagations/pending?${params.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch propagation count");
  const data = (await res.json()) as { suggestions: unknown[] };
  return data.suggestions.length;
};
