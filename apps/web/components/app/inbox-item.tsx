"use client";

import { SeverityBadge } from "@/components/app/severity-badge";
import type { Propagation } from "@/lib/api-types";

export const InboxItem = ({
  propagation,
  showProject,
}: {
  propagation: Propagation;
  showProject?: boolean;
}) => {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/50">
      <div className="flex items-start gap-3">
        <SeverityBadge severity={propagation.severity} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium leading-snug">{propagation.lessonTitle}</h3>
          {showProject && propagation.targetProject ? (
            <p className="text-xs text-muted-foreground mt-1">{propagation.targetProject}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};
