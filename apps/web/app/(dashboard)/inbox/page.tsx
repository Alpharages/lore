"use client";

import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/hooks/use-project";
import { fetchPropagations, fetchPropagationMetadata } from "@/lib/api";
import { InboxItem } from "@/components/app/inbox-item";
import { EmptyState } from "@/components/app/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Propagation } from "@/lib/api-types";

const severityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const sortPropagations = (items: Propagation[]) =>
  [...items].sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
    if (sevDiff !== 0) return sevDiff;
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });

export const formatLastRun = (isoTimestamp: string | null | undefined): string => {
  if (!isoTimestamp) return "recently";
  const diffMs = Math.max(0, Date.now() - new Date(isoTimestamp).getTime());
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 2) return "just now";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours === 1 ? "1 hour" : `${diffHours} hours`} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays === 1 ? "1 day" : `${diffDays} days`} ago`;
};

const InboxSkeleton = () => (
  <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3 h-[100px]">
    <div className="flex items-start gap-3">
      <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      <Skeleton className="h-5 w-full" />
    </div>
    <Skeleton className="h-4 w-3/4" />
  </div>
);

const InboxPage = () => {
  const { projectSlug } = useProject();

  const { data, isLoading } = useQuery({
    queryKey: ["propagations", projectSlug],
    queryFn: () => fetchPropagations(projectSlug === "all" ? undefined : projectSlug),
  });

  const { data: metadata } = useQuery({
    queryKey: ["propagations", "metadata", projectSlug],
    queryFn: () => fetchPropagationMetadata(projectSlug === "all" ? undefined : projectSlug),
    retry: false,
  });

  const items = data ? sortPropagations(data) : [];
  const count = items.length;
  const lastRan = formatLastRun(metadata?.lastRunAt);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Inbox</h1>
        {!isLoading && count > 0 && (
          <Badge variant="secondary" aria-live="polite" className="text-xs font-medium">
            {count === 1 ? "1 pending" : `${count} pending`}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <InboxSkeleton />
          <InboxSkeleton />
          <InboxSkeleton />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="All caught up"
          description={`No pending suggestions. Propagation engine last ran ${lastRan}.`}
        />
      ) : (
        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="space-y-3 pr-4">
            {items.map((propagation) => (
              <InboxItem
                key={propagation.id}
                propagation={propagation}
                showProject={projectSlug === "all"}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </section>
  );
};

export default InboxPage;
