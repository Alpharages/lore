import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EvolutionStatus, EvolutionItemType } from "@/lib/api-types";
import { EVOLUTION_TYPE_LABELS } from "@/lib/api-types";

/**
 * Lifecycle status is the single most important thing to read off an evolution
 * item — "proposed" and "accepted" mean very different things to someone about
 * to build against it (§4.3) — so each status gets its own colour rather than a
 * uniform neutral badge.
 */
const STATUS_STYLES: Record<EvolutionStatus, string> = {
  proposed: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  accepted: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  rejected: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  superseded: "border-border bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<EvolutionStatus, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
};

export const EvolutionStatusBadge = ({
  status,
  className,
}: {
  status: EvolutionStatus;
  className?: string;
}) => (
  <Badge
    variant="outline"
    aria-label={`Status: ${STATUS_LABELS[status]}`}
    className={cn("text-[10px] font-medium", STATUS_STYLES[status], className)}
  >
    {STATUS_LABELS[status]}
  </Badge>
);

export const EvolutionTypeBadge = ({
  type,
  className,
}: {
  type: EvolutionItemType;
  className?: string;
}) => (
  <Badge variant="secondary" className={cn("text-[10px]", className)}>
    {EVOLUTION_TYPE_LABELS[type] ?? type}
  </Badge>
);
