"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { fetchProjects } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export const ProjectSwitcher = () => {
  const { projectSlug, setProject } = useProject();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    refetchOnWindowFocus: false,
  });

  const selectedProject = projects?.find((p) => p.slug === projectSlug);
  const displayName =
    selectedProject?.name ?? (projectSlug === "all" ? "All Projects" : projectSlug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 font-normal">
          <span className="text-sm">{isLoading ? "Loading…" : displayName}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setProject("all")}>All Projects</DropdownMenuItem>
        {projects?.map((project) => (
          <DropdownMenuItem key={project.id} onClick={() => setProject(project.slug)}>
            {project.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ProjectSwitcher;
