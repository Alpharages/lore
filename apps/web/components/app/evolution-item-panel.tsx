"use client";

import { useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Check, X, ExternalLink, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EvolutionStatusBadge, EvolutionTypeBadge } from "./evolution-status-badge";
import { useProject } from "@/hooks/use-project";
import { fetchEvolutionItem, reviewEvolutionItem } from "@/lib/api";
import type { EvolutionEvidence, EvolutionRelation } from "@/lib/api-types";

const relativeTime = (iso: string | null): string => {
  if (!iso) return "unknown";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "unknown";
  }
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
    {children}
  </section>
);

/** FR-PE-61: reviewers must be able to inspect evidence before accepting. This
 *  is the one surface that shows the full excerpt rather than a preview. */
const EvidenceCard = ({ evidence }: { evidence: EvolutionEvidence }) => (
  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className="font-mono text-[10px]">
        {evidence.source_kind}
      </Badge>
      {evidence.source_author ? (
        <span className="text-[10px] text-muted-foreground">by {evidence.source_author}</span>
      ) : null}
      <Badge variant="secondary" className="text-[10px]">
        {evidence.excerpt_provided_by}
      </Badge>
      {evidence.superseded_by_evidence_id ? (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          superseded
        </Badge>
      ) : null}
    </div>

    {evidence.redacted ? (
      <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
        <ShieldAlert className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <span>
          Excerpt redacted
          {evidence.redaction_reason ? `: ${evidence.redaction_reason}` : ""}. The source reference
          and provenance are retained.
        </span>
      </p>
    ) : evidence.excerpt ? (
      <blockquote className="border-l-2 border-border pl-2 text-xs text-foreground whitespace-pre-wrap">
        {evidence.excerpt}
      </blockquote>
    ) : (
      <p className="text-xs italic text-muted-foreground">No excerpt captured.</p>
    )}

    {evidence.source_reference ? (
      <a
        href={evidence.source_reference}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline break-all"
      >
        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        {evidence.source_reference}
      </a>
    ) : null}
  </div>
);

const RelationRow = ({ relation, itemId }: { relation: EvolutionRelation; itemId: string }) => {
  const outgoing = relation.from_item_id === itemId;
  const otherId = outgoing ? relation.to_item_id : relation.from_item_id;
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="outline" className="text-[10px]">
        {outgoing ? relation.relation_type : `${relation.relation_type} (incoming)`}
      </Badge>
      <span className="font-mono text-[10px] text-muted-foreground">{otherId.slice(0, 8)}</span>
      {relation.retracted_at ? (
        <span className="text-[10px] text-muted-foreground">retracted</span>
      ) : null}
    </li>
  );
};

export const EvolutionItemPanel = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { projectSlug } = useProject();
  const queryClient = useQueryClient();

  const itemId = searchParams.get("item");

  // Keep rendering the last item while the sheet animates closed, so the
  // content does not blank out mid-transition.
  const prevItemIdRef = useRef<string | null>(null);
  if (itemId) prevItemIdRef.current = itemId;
  const activeId = itemId ?? prevItemIdRef.current;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["evolution", "item", projectSlug, activeId],
    queryFn: () => fetchEvolutionItem(projectSlug, activeId!),
    enabled: Boolean(activeId) && projectSlug !== "all",
  });

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("item");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const reviewMutation = useMutation({
    mutationFn: (action: "accept" | "reject") =>
      reviewEvolutionItem({ project: projectSlug, id: activeId!, action }),
    onSuccess: (result) => {
      toast.success(result.status === "accepted" ? "Item accepted" : "Item rejected");
      queryClient.invalidateQueries({ queryKey: ["evolution"] });
      handleClose();
    },
    onError: (error: unknown) => {
      // The server refuses acceptance without evidence (FR-PE-18) and refuses a
      // second review of an already-reviewed item — surface its reason rather
      // than a generic failure.
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Review failed";
      toast.error(message);
    },
  });

  const open = Boolean(itemId);
  const item = data?.item;

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : handleClose())}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="pr-8 text-base">
            {isLoading ? <Skeleton className="h-5 w-3/4" /> : (item?.title ?? "Item")}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {item ? (
                <>
                  <EvolutionTypeBadge type={item.type} />
                  <EvolutionStatusBadge status={item.status} />
                  <span className="text-[10px] text-muted-foreground">
                    revision {item.revision} · created {relativeTime(item.created_at)}
                  </span>
                </>
              ) : null}
            </div>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="space-y-5 p-4">
            {isError ? (
              <p className="text-sm text-muted-foreground">Failed to load this item.</p>
            ) : isLoading || !data ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                <Section title="Statement">
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {data.item.statement}
                  </p>
                </Section>

                {data.item.rationale ? (
                  <Section title="Why">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {data.item.rationale}
                    </p>
                  </Section>
                ) : null}

                <Section title={`Evidence (${data.evidence.length})`}>
                  {data.evidence.length === 0 ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No evidence yet. An item cannot be accepted without at least one evidence
                      record.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.evidence.map((evidence) => (
                        <EvidenceCard key={evidence.id} evidence={evidence} />
                      ))}
                    </div>
                  )}
                </Section>

                {data.versions.length > 1 ? (
                  <Section title={`Revisions (${data.versions.length})`}>
                    <ol className="space-y-2">
                      {data.versions.map((version) => (
                        <li
                          key={version.revision}
                          className="rounded-lg border border-border p-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              rev {version.revision}
                            </Badge>
                            {version.authored_by ? (
                              <span className="text-[10px] text-muted-foreground">
                                {version.authored_by}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                            {version.statement}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </Section>
                ) : null}

                {data.relations.length > 0 ? (
                  <Section title="Relationships">
                    <ul className="space-y-1">
                      {data.relations.map((relation) => (
                        <RelationRow key={relation.id} relation={relation} itemId={data.item.id} />
                      ))}
                    </ul>
                  </Section>
                ) : null}

                {data.links.length > 0 ? (
                  <Section title="Linked work">
                    <ul className="space-y-1 text-xs">
                      {data.links.map((link) => (
                        <li key={link.id} className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {link.target_kind}
                          </Badge>
                          <span className="font-mono text-[10px] text-muted-foreground break-all">
                            {link.session_id ?? link.external_task_ref ?? link.external_task_id}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}

                <Section title="Review history">
                  <ol className="space-y-1">
                    {data.events.map((event) => (
                      <li key={event.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                          {event.event_type}
                        </Badge>
                        {event.actor ? (
                          <span className="text-muted-foreground">{event.actor}</span>
                        ) : null}
                        <span className="text-[10px] text-muted-foreground">
                          {relativeTime(event.created_at)}
                        </span>
                        {event.note ? (
                          <span className="w-full text-muted-foreground">{event.note}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Section>
              </>
            )}
          </div>
        </ScrollArea>

        {item?.status === "proposed" ? (
          <div className="flex gap-2 border-t border-border p-4">
            <Button
              size="sm"
              onClick={() => reviewMutation.mutate("accept")}
              disabled={reviewMutation.isPending}
            >
              <Check className="mr-1 size-4" aria-hidden="true" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reviewMutation.mutate("reject")}
              disabled={reviewMutation.isPending}
            >
              <X className="mr-1 size-4" aria-hidden="true" />
              Reject
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
