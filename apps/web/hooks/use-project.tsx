"use client";

import { createContext, useContext, useState } from "react";

interface ProjectContext {
  projectSlug: string | "all";
  setProject: (slug: string | "all") => void;
}

const ProjectCtx = createContext<ProjectContext>({
  projectSlug: "all",
  setProject: () => {},
});

export const ProjectProvider = ({ children }: { children: React.ReactNode }) => {
  const [projectSlug, setProjectSlug] = useState<string | "all">(() =>
    typeof window !== "undefined" ? (localStorage.getItem("lore-project") ?? "all") : "all"
  );

  const setProject = (slug: string | "all") => {
    setProjectSlug(slug);
    try {
      localStorage.setItem("lore-project", slug);
    } catch {
      // storage quota exceeded or private browsing restriction — state still updates in memory
    }
  };

  return <ProjectCtx.Provider value={{ projectSlug, setProject }}>{children}</ProjectCtx.Provider>;
};

export const useProject = () => useContext(ProjectCtx);
