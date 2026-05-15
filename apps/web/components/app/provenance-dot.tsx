"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Provenance } from "@/lib/api-types";

const dotClasses: Record<Provenance, string> = {
  code_review: "bg-indigo-500",
  manual: "bg-zinc-500",
  propagated: "bg-emerald-500",
};

const dotLabels: Record<Provenance, string> = {
  code_review: "From review",
  manual: "Manual",
  propagated: "Propagated",
};

export const ProvenanceDot = ({ provenance }: { provenance: Provenance }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        tabIndex={0}
        aria-label={dotLabels[provenance]}
        className={cn("inline-block size-1.5 rounded-full cursor-default", dotClasses[provenance])}
      />
    </TooltipTrigger>
    <TooltipContent side="top">{dotLabels[provenance]}</TooltipContent>
  </Tooltip>
);
