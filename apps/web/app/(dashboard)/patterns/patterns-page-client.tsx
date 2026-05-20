"use client";

import { useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { fetchPatterns } from "@/lib/api";
import { FilterChips } from "@/components/app/filter-chips";
import { PatternCard } from "@/components/app/pattern-card";
import { PatternPanel } from "@/components/app/pattern-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FilterState } from "@/lib/api-types";

export const PatternsPageClient = () => {
  const searchParams = useSearchParams();
  const { projectSlug } = useProject();

  const tags = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
  const category = searchParams.get("category") ?? "";
  const activeFilters: FilterState = { tags, severity: [], category };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["patterns", activeFilters, projectSlug],
    queryFn: () =>
      fetchPatterns({
        project: projectSlug === "all" ? undefined : projectSlug,
        tags: activeFilters.tags.length > 0 ? activeFilters.tags : undefined,
        category: activeFilters.category || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const patterns = data?.patterns ?? [];
  const total = data?.total ?? patterns.length;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Patterns</h1>

      {isError ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Failed to load patterns. Please try again.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {data !== undefined && (
            <FilterChips
              results={patterns}
              activeFilters={activeFilters}
              basePath="/patterns"
              showSeverity={false}
            />
          )}

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-24 rounded-xl border border-border bg-card animate-pulse"
                />
              ))}
            </div>
          ) : patterns.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No patterns yet. Patterns are captured automatically from BMAD architecture
                workflows.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-180px)]">
              <div className="space-y-3 pr-4">
                {patterns.map((pattern) => (
                  <PatternCard key={pattern.id} pattern={pattern} />
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="text-xs text-muted-foreground">
            {total} pattern{total !== 1 ? "s" : ""}
          </div>
        </>
      )}

      <PatternPanel />
    </section>
  );
};
