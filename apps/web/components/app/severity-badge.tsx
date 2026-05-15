"use client";

import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/api-types";

export const severityClasses: Record<Severity, string> = {
  critical: "bg-red-500 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-zinc-900",
  low: "bg-blue-500 text-white",
};

export const SeverityBadge = ({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) => (
  <span
    data-severity={severity}
    className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
      severityClasses[severity],
      className
    )}
  >
    {severity}
  </span>
);
