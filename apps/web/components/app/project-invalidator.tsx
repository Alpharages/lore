"use client";

import { useEffect, useRef } from "react";
import { useProject } from "@/hooks/use-project";
import { queryClient } from "@/lib/query-client";

export const ProjectInvalidator = () => {
  const { projectSlug } = useProject();
  const prevSlug = useRef<string | null>(null);

  useEffect(() => {
    if (prevSlug.current === null) {
      prevSlug.current = projectSlug;
      return;
    }
    if (prevSlug.current === projectSlug) return;
    prevSlug.current = projectSlug;
    queryClient.invalidateQueries({ queryKey: ["lessons"] });
    queryClient.invalidateQueries({ queryKey: ["propagations"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [projectSlug]);

  return null;
};
