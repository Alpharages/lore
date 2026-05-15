"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/app/severity-badge";
import { acceptPropagation, rejectPropagation } from "@/lib/api";
import { useProject } from "@/hooks/use-project";
import { useToast } from "@/hooks/use-toast";
import type { Propagation } from "@/lib/api-types";

const DISMISS_ANIMATION_MS = 150;

type PropagationAction = "accept" | "reject";

interface MutationVariables {
  id: string;
  action: PropagationAction;
  isUndo?: boolean;
}

const waitForDismissAnimation = () =>
  new Promise((resolve) => {
    setTimeout(resolve, DISMISS_ANIMATION_MS);
  });

export interface InboxItemProps {
  propagation: Propagation;
  showProject?: boolean;
}

export const InboxItem = ({ propagation, showProject }: InboxItemProps) => {
  const { projectSlug } = useProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const originalIndexRef = useRef<number>(-1);

  const queryKey = ["propagations", projectSlug] as const;

  const mutation = useMutation({
    mutationFn: ({ id, action }: MutationVariables) =>
      action === "accept" ? acceptPropagation(id) : rejectPropagation(id),

    onMutate: async ({ id, isUndo }) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<Propagation[]>(queryKey);
      if (isUndo) {
        return { previous, isUndo };
      }

      const idx = previous?.findIndex((p) => p.id === id) ?? -1;
      originalIndexRef.current = idx;

      setDismissed(true);
      await waitForDismissAnimation();

      queryClient.setQueryData<Propagation[]>(
        queryKey,
        (old) => old?.filter((p) => p.id !== id) ?? []
      );

      return { previous, isUndo: false };
    },

    onError: (_err, { id }, context) => {
      if (context?.isUndo) {
        queryClient.setQueryData<Propagation[]>(
          queryKey,
          (old) => old?.filter((p) => p.id !== id) ?? []
        );
        setDismissed(true);
      } else if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
        setDismissed(false);
      }
      toast("Action failed.", { duration: 8000 });
    },

    onSuccess: (_data, { action, isUndo }) => {
      queryClient.invalidateQueries({ queryKey: ["propagations"] });
      if (isUndo) {
        return;
      }

      const message = action === "accept" ? "Added to your project's memory." : "Dismissed.";
      toast(message, {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => handleUndo(action),
        },
      });
    },
  });

  const handleUndo = (originalAction: PropagationAction) => {
    const reverseAction = originalAction === "accept" ? "reject" : "accept";

    queryClient.setQueryData<Propagation[]>(queryKey, (old) => {
      const arr = old ? [...old] : [];
      const idx = originalIndexRef.current >= 0 ? originalIndexRef.current : arr.length;
      arr.splice(idx, 0, propagation);
      return arr;
    });

    setDismissed(false);
    mutation.mutate({ id: propagation.id, action: reverseAction, isUndo: true });
  };

  const containerClasses = dismissed
    ? "opacity-0 max-h-0 overflow-hidden py-0 my-0 border-transparent"
    : "opacity-100 max-h-[500px]";

  return (
    <div
      className={`relative rounded-lg border border-border bg-card p-4 shadow-sm transition-all duration-150 hover:border-border/80 focus-within:border-l-2 focus-within:border-primary focus-within:bg-muted/50 ${containerClasses}`}
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
          onClick={() => mutation.mutate({ id: propagation.id, action: "accept" })}
          disabled={mutation.isPending}
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
          onClick={() => mutation.mutate({ id: propagation.id, action: "reject" })}
          disabled={mutation.isPending}
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
