"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Lesson, FilterState } from "@/lib/api-types";

interface FilterChipsProps {
  results: Lesson[];
  activeFilters: FilterState;
}

const SEVERITY_OPTIONS = ["critical", "high", "medium", "low"] as const;

export const FilterChips = ({ results, activeFilters }: FilterChipsProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const availableTags = Array.from(new Set(results.flatMap((l) => l.stackTags ?? []))).sort();
  const availableCategories = Array.from(
    new Set(results.map((l) => l.category).filter(Boolean) as string[])
  ).sort();

  const tagCount = (tag: string) => results.filter((l) => l.stackTags?.includes(tag)).length;
  const severityCount = (sev: string) => results.filter((l) => l.severity === sev).length;
  const categoryCount = (cat: string) => results.filter((l) => l.category === cat).length;

  const hasActiveFilters =
    activeFilters.tags.length > 0 ||
    activeFilters.severity.length > 0 ||
    !!activeFilters.category;

  const setFilter = (key: keyof FilterState, value: string[] | string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (Array.isArray(value) && value.length === 0) {
      params.delete(key);
    } else if (Array.isArray(value)) {
      params.set(key, value.join(","));
    } else if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `/lessons?${qs}` : "/lessons", { scroll: false });
  };

  const toggleTag = (tag: string) => {
    const next = activeFilters.tags.includes(tag)
      ? activeFilters.tags.filter((t) => t !== tag)
      : [...activeFilters.tags, tag];
    setFilter("tags", next);
  };

  const toggleSeverity = (sev: string) => {
    const next = activeFilters.severity.includes(sev)
      ? activeFilters.severity.filter((s) => s !== sev)
      : [...activeFilters.severity, sev];
    setFilter("severity", next);
  };

  const toggleCategory = (cat: string) => {
    const next = activeFilters.category === cat ? "" : cat;
    setFilter("category", next);
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tags");
    params.delete("severity");
    params.delete("category");
    const qs = params.toString();
    router.replace(qs ? `/lessons?${qs}` : "/lessons", { scroll: false });
  };

  const chipBase = "cursor-pointer select-none text-xs font-medium hover:opacity-80";

  return (
    <div className="space-y-3">
      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Stack Tag
          </span>
          {availableTags.map((tag) => {
            const active = activeFilters.tags.includes(tag);
            return (
              <Badge
                key={tag}
                asChild
                variant={active ? "default" : "secondary"}
                className={cn(chipBase, "font-mono", active && "bg-primary text-primary-foreground")}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  title={tag}
                  onClick={() => toggleTag(tag)}
                >
                  {tag} ({tagCount(tag)})
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Severity
        </span>
        {SEVERITY_OPTIONS.map((sev) => {
          const active = activeFilters.severity.includes(sev);
          const count = severityCount(sev);
          return (
            <Badge
              key={sev}
              asChild
              variant={active ? "default" : "secondary"}
              className={cn(chipBase, active && "bg-primary text-primary-foreground")}
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => toggleSeverity(sev)}
              >
                {sev} ({count})
              </button>
            </Badge>
          );
        })}
      </div>

      {availableCategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Category
          </span>
          {availableCategories.map((cat) => {
            const active = activeFilters.category === cat;
            return (
              <Badge
                key={cat}
                asChild
                variant={active ? "default" : "secondary"}
                className={cn(chipBase, active && "bg-primary text-primary-foreground")}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  title={cat}
                  onClick={() => toggleCategory(cat)}
                >
                  {cat} ({categoryCount(cat)})
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-xs text-primary hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};
