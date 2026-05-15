"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/app/severity-badge";
import type { Propagation } from "@/lib/api-types";

export interface InboxItemProps {
  propagation: Propagation;
  showProject?: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
}

export const InboxItem = ({ propagation, showProject, onAccept, onReject }: InboxItemProps) => {
  return (
    <div
      className="relative rounded-lg border border-border bg-card p-4 shadow-sm transition-all duration-150 hover:border-border/80 focus-within:border-l-2 focus-within:border-primary focus-within:bg-muted/50"
      data-testid="inbox-item"
    >
      {/* Header: severity + title */}
      <div className="flex items-start gap-3 mb-2">
        <SeverityBadge severity={propagation.severity} />
        <Link
          href={`/lessons?lesson=${propagation.lessonId}`}
          className="text-sm font-medium text-foreground hover:text-primary hover:underline flex-1 leading-snug"
          aria-label={`Open lesson: ${propagation.lessonTitle}`}
        >
          {propagation.lessonTitle}
        </Link>
      </div>

      {/* Problem summary */}
      <p className="text-xs text-muted-foreground mb-1 line-clamp-2">
        <span className="font-medium text-foreground">Problem:</span> {propagation.problem}
      </p>

      {/* Why suggested */}
      <p className="text-xs text-muted-foreground mb-3">
        <span className="font-medium text-foreground">Why suggested:</span> Shares{" "}
        {propagation.sharedStackTags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs mx-0.5 px-1 py-0 font-mono">
            {tag}
          </Badge>
        ))}{" "}
        with {propagation.sourceProject} · {propagation.occurrenceCount} occurrence
        {propagation.occurrenceCount !== 1 ? "s" : ""} · trust:{" "}
        <span className="capitalize">{propagation.trustTier}</span>
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={() => onAccept(propagation.id)}
          aria-label={`Accept: ${propagation.lessonTitle}`}
          className="gap-1.5"
          data-testid="accept-button"
        >
          <Check className="h-3.5 w-3.5" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onReject(propagation.id)}
          aria-label={`Reject: ${propagation.lessonTitle}`}
          className="gap-1.5"
          data-testid="reject-button"
        >
          <X className="h-3.5 w-3.5" />
          Reject
        </Button>
        <span className="ml-auto text-xs text-muted-foreground/50 select-none">
          <kbd className="text-[10px] border border-border rounded px-1">A</kbd> accept ·{" "}
          <kbd className="text-[10px] border border-border rounded px-1">R</kbd> reject
        </span>
      </div>

      {showProject && propagation.targetProject ? (
        <p className="text-xs text-muted-foreground mt-2">{propagation.targetProject}</p>
      ) : null}
    </div>
  );
};
