"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { EvolutionStatusBadge, EvolutionTypeBadge } from "./evolution-status-badge";
import type { EvolutionItem } from "@/lib/api-types";

const STATEMENT_PREVIEW_MAX = 180;

const truncate = (text: string): string => {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > STATEMENT_PREVIEW_MAX
    ? `${trimmed.slice(0, STATEMENT_PREVIEW_MAX).trimEnd()}...`
    : trimmed;
};

/**
 * Opens the detail panel via a query parameter so a reviewer can link a
 * colleague straight to the item they are asking about.
 */
export const EvolutionItemCard = ({
  item,
  showType = true,
}: {
  item: EvolutionItem;
  showType?: boolean;
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("item", item.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams, item.id]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    },
    [open]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={item.title}
      onClick={open}
      onKeyDown={handleKey}
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm",
        "cursor-pointer transition-shadow duration-150 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-sm font-medium text-foreground">{item.title}</h3>
        <EvolutionStatusBadge status={item.status} />
      </div>

      <p className="text-xs text-muted-foreground">{truncate(item.statement)}</p>

      <div className="flex flex-wrap items-center gap-2">
        {showType ? <EvolutionTypeBadge type={item.type} /> : null}
        {item.revision > 1 ? (
          <span className="text-[10px] text-muted-foreground">rev {item.revision}</span>
        ) : null}
        <span
          className={cn(
            "ml-auto flex items-center gap-1 text-[10px]",
            // FR-PE-18: an item with no *live* evidence can never be accepted,
            // so the absence is worth flagging rather than rendering as a quiet
            // zero — unless FR-PE-27 redaction explains it, which is lawful and
            // must not read as a missing-evidence defect.
            item.evidence_count === 0 && item.redacted_evidence_count === 0
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
          )}
        >
          <FileText className="size-3" aria-hidden="true" />
          {item.evidence_count > 0
            ? `${item.evidence_count} evidence`
            : item.redacted_evidence_count > 0
              ? "Evidence redacted"
              : "No evidence"}
        </span>
      </div>
    </div>
  );
};
