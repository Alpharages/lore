"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { useProject } from "@/hooks/use-project";
import { fetchLessons } from "@/lib/api";
import { SearchBar } from "@/components/app/search-bar";
import { FilterChips } from "@/components/app/filter-chips";
import { LessonCard } from "@/components/app/lesson-card";
import { LessonCardSkeletonList } from "@/components/app/lesson-card-skeleton";
import { LessonPanel } from "@/components/app/lesson-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FilterState } from "@/lib/api-types";

export const LessonsPageClient = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { projectSlug } = useProject();
  const searchBarRef = useRef<HTMLInputElement>(null);

  const initialQ = searchParams.get("q") ?? "";
  const [inputValue, setInputValue] = useState(initialQ);
  const debouncedQuery = useDebounce(inputValue, 250);

  const tags = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
  const severity = searchParams.get("severity")?.split(",").filter(Boolean) ?? [];
  const category = searchParams.get("category") ?? "";
  const activeFilters: FilterState = { tags, severity, category };

  // Ref so the debounce effect always reads the latest params without re-firing on every chip click.
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  useEffect(() => {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    if (debouncedQuery) {
      params.set("q", debouncedQuery);
    } else {
      params.delete("q");
    }
    const qs = params.toString();
    router.replace(qs ? `/lessons?${qs}` : "/lessons", { scroll: false });
  }, [debouncedQuery, router]);

  const enabled = debouncedQuery.length >= 2 || debouncedQuery.length === 0;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["lessons", debouncedQuery, activeFilters, projectSlug],
    queryFn: () =>
      fetchLessons({
        q: debouncedQuery || undefined,
        project: projectSlug === "all" ? undefined : projectSlug,
        tags: activeFilters.tags.length > 0 ? activeFilters.tags : undefined,
        severity: activeFilters.severity.length > 0 ? activeFilters.severity : undefined,
        category: activeFilters.category || undefined,
        limit: debouncedQuery ? undefined : 20,
      }),
    enabled,
    placeholderData: keepPreviousData,
  });

  const lessons = data?.lessons ?? [];
  const total = data?.total ?? lessons.length;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Lessons</h1>
      <SearchBar
        ref={searchBarRef}
        value={inputValue}
        onChange={setInputValue}
        count={!isLoading && data !== undefined ? total : undefined}
        isError={isError}
        onRetry={refetch}
      />

      {data !== undefined && <FilterChips results={lessons} activeFilters={activeFilters} />}

      {isLoading ? (
        <LessonCardSkeletonList count={debouncedQuery ? 5 : 20} />
      ) : lessons.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {debouncedQuery
              ? "No lessons match this search. Try broader terms or remove filters."
              : "No lessons yet. Captured automatically from BMAD code reviews. Run lore install to connect developers."}
          </p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          {!debouncedQuery && <p className="text-xs text-muted-foreground mb-3">Recent lessons</p>}
          <div className="space-y-3 pr-4">
            {lessons.map((lesson) => (
              <LessonCard key={lesson.id} lesson={lesson} />
            ))}
          </div>
        </ScrollArea>
      )}
      <LessonPanel searchBarRef={searchBarRef} />
    </section>
  );
};
