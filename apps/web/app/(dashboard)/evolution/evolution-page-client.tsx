"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useProject } from "@/hooks/use-project";
import { fetchEvolutionCurrent, fetchEvolutionProposals, fetchEvolutionHistory } from "@/lib/api";
import { EvolutionItemCard } from "@/components/app/evolution-item-card";
import { EvolutionItemPanel } from "@/components/app/evolution-item-panel";
import { EvolutionStatusBadge } from "@/components/app/evolution-status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  EVOLUTION_TYPE_LABELS,
  EVOLUTION_TYPE_ORDER,
  type EvolutionItem,
  type EvolutionItemType,
  type EvolutionWarning,
} from "@/lib/api-types";

type Tab = "context" | "inbox" | "timeline";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "context", label: "Current context" },
  { id: "inbox", label: "Review inbox" },
  { id: "timeline", label: "Timeline" },
];

const relativeTime = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
};

const ListSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="h-24 rounded-xl border border-border bg-card animate-pulse" />
    ))}
  </div>
);

/** FR-PE-22: unresolved conflicts travel with the current state, not in a
 *  separate place a reader has to think to check. */
const Warnings = ({ warnings }: { warnings: EvolutionWarning[] }) => {
  if (warnings.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        {warnings.length === 1
          ? "1 unresolved conflict"
          : `${warnings.length} unresolved conflicts`}
      </p>
      <ul className="space-y-0.5">
        {warnings.map((warning) => (
          <li
            key={warning.item_ids.join(":")}
            className="text-xs text-amber-700 dark:text-amber-400"
          >
            {warning.message}
          </li>
        ))}
      </ul>
    </div>
  );
};

/** FR-PE-62: the current context view is grouped by item type. */
const groupByType = (items: EvolutionItem[]): Array<[EvolutionItemType, EvolutionItem[]]> =>
  EVOLUTION_TYPE_ORDER.map(
    (type) =>
      [type, items.filter((item) => item.type === type)] as [EvolutionItemType, EvolutionItem[]]
  ).filter(([, group]) => group.length > 0);

export const EvolutionPageClient = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projectSlug } = useProject();

  const tab = (searchParams.get("tab") as Tab) ?? "context";

  // `useProject` seeds itself from localStorage, which the server cannot see:
  // the server always renders as "all projects" while the client may already
  // know a project is selected. Because this page renders a structurally
  // different tree in those two cases, rendering the real content on the first
  // client pass is a hydration mismatch — and a failed hydration leaves the
  // item cards' click handlers dead in a production build. Rendering the same
  // placeholder as the server until after mount keeps the first pass identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const scoped = mounted && projectSlug !== "all";

  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      // Closing the detail panel on a tab switch avoids leaving an item open
      // that the newly-selected tab does not list.
      params.delete("item");
      router.replace(`/evolution?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const current = useQuery({
    queryKey: ["evolution", "current", projectSlug],
    queryFn: () => fetchEvolutionCurrent(projectSlug),
    enabled: scoped && tab === "context",
    placeholderData: keepPreviousData,
  });

  const proposals = useQuery({
    queryKey: ["evolution", "proposals", projectSlug],
    queryFn: () => fetchEvolutionProposals(projectSlug),
    enabled: scoped,
    placeholderData: keepPreviousData,
  });

  const history = useQuery({
    queryKey: ["evolution", "history", projectSlug],
    queryFn: () => fetchEvolutionHistory(projectSlug),
    enabled: scoped && tab === "timeline",
    placeholderData: keepPreviousData,
  });

  // Project Evolution is scoped to exactly one project (FR-PE-03), so there is
  // no meaningful "all projects" view to render.
  if (!scoped) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Project Evolution</h1>
        {mounted ? (
          <EmptyState
            title="Select a project"
            description="Project Evolution is scoped to a single project. Choose one from the project switcher to see its current context and history."
          />
        ) : (
          <ListSkeleton />
        )}
      </section>
    );
  }

  const pendingCount = proposals.data?.total ?? 0;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Project Evolution</h1>
        {pendingCount > 0 ? (
          <Badge variant="secondary" aria-live="polite" className="text-xs font-medium">
            {pendingCount === 1 ? "1 pending review" : `${pendingCount} pending review`}
          </Badge>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Project evolution views"
        className="flex gap-1 border-b border-border"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              tab === entry.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "context" ? (
        current.isError ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Failed to load current context.
          </p>
        ) : current.isLoading ? (
          <ListSkeleton />
        ) : (current.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="No accepted project context yet"
            description="Capture requirements, decisions, scope changes, constraints and research findings through the Lore MCP tools, then accept them here."
          />
        ) : (
          <div className="space-y-4">
            <Warnings warnings={current.data?.warnings ?? []} />
            <ScrollArea className="h-[calc(100vh-240px)]">
              <div className="space-y-6 pr-4">
                {groupByType(current.data!.items).map(([type, group]) => (
                  <div key={type} className="space-y-3">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      {EVOLUTION_TYPE_LABELS[type]}
                      <span className="ml-2 text-xs">({group.length})</span>
                    </h2>
                    {group.map((item) => (
                      <EvolutionItemCard key={item.id} item={item} showType={false} />
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )
      ) : null}

      {tab === "inbox" ? (
        proposals.isError ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Failed to load proposals.
          </p>
        ) : proposals.isLoading ? (
          <ListSkeleton />
        ) : (proposals.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Nothing awaiting review"
            description="Captured project updates land here as proposals until someone accepts or rejects them."
          />
        ) : (
          <ScrollArea className="h-[calc(100vh-220px)]">
            <div className="space-y-3 pr-4">
              {proposals.data!.items.map((item) => (
                <EvolutionItemCard key={item.id} item={item} />
              ))}
            </div>
          </ScrollArea>
        )
      ) : null}

      {tab === "timeline" ? (
        history.isError ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Failed to load timeline.
          </p>
        ) : history.isLoading ? (
          <ListSkeleton />
        ) : (history.data?.events.length ?? 0) === 0 ? (
          <EmptyState
            title="No project history yet"
            description="Proposals, revisions, acceptances and supersessions appear here in the order they happened."
          />
        ) : (
          <ScrollArea className="h-[calc(100vh-220px)]">
            <ol className="space-y-2 pr-4">
              {history.data!.events.map((event) => {
                const item = history.data!.items.find((i) => i.id === event.item_id);
                return (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-baseline gap-2 rounded-lg border border-border bg-card p-3"
                  >
                    <Badge variant="secondary" className="text-[10px]">
                      {event.event_type}
                    </Badge>
                    <span className="flex-1 text-sm text-foreground">
                      {item?.title ?? "(item removed)"}
                    </span>
                    {item ? <EvolutionStatusBadge status={item.status} /> : null}
                    {event.actor ? (
                      <span className="text-xs text-muted-foreground">{event.actor}</span>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">
                      {relativeTime(event.created_at)}
                    </span>
                    {event.note ? (
                      <span className="w-full text-xs text-muted-foreground">{event.note}</span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </ScrollArea>
        )
      ) : null}

      <EvolutionItemPanel />
    </section>
  );
};
