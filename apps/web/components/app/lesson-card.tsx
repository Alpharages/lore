"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "./severity-badge";
import { ProvenanceDot } from "./provenance-dot";
import { cn } from "@/lib/utils";
import type { Lesson } from "@/lib/api-types";

const MAX_VISIBLE_TAGS = 4;
const FIX_PREVIEW_MAX = 120;

const firstSentence = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^.+?[.!?](?=\s|$)/);
  const sentence = (match ? match[0] : trimmed).trim();
  return sentence.length > FIX_PREVIEW_MAX
    ? `${sentence.slice(0, FIX_PREVIEW_MAX).trimEnd()}…`
    : sentence;
};

export const LessonCard = ({ lesson }: { lesson: Lesson }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lesson", lesson.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams, lesson.id]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    },
    [open]
  );

  const fixPreview = firstSentence(lesson.fix);
  const visibleTags = lesson.stackTags.slice(0, MAX_VISIBLE_TAGS);
  const overflowCount = lesson.stackTags.length - visibleTags.length;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={lesson.title}
      onClick={open}
      onKeyDown={handleKey}
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm",
        "cursor-pointer transition-shadow duration-150 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <div className="flex items-start gap-2">
        <SeverityBadge severity={lesson.severity} />
        <h3 className="flex-1 truncate text-sm font-medium text-foreground">{lesson.title}</h3>
      </div>
      {fixPreview ? (
        <p className="text-xs text-muted-foreground line-clamp-2">{fixPreview}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {visibleTags.map((tag) => (
          <Badge key={tag} variant="outline" className="font-mono text-[10px]">
            {tag}
          </Badge>
        ))}
        {overflowCount > 0 ? (
          <Badge variant="secondary" className="text-[10px]">
            +{overflowCount} more
          </Badge>
        ) : null}
        <ProvenanceDot provenance={lesson.provenance} />
      </div>
    </div>
  );
};
