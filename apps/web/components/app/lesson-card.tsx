"use client";

import { Badge } from "@/components/ui/badge";
import type { Lesson } from "@/lib/api-types";

interface LessonCardProps {
  lesson: Lesson;
  onClick?: () => void;
}

const severityVariant = (severity: string): "default" | "destructive" | "secondary" | "outline" => {
  switch (severity) {
    case "critical":
      return "destructive";
    case "high":
      return "default";
    case "medium":
      return "secondary";
    default:
      return "outline";
  }
};

const fixPreview = (fix: string): string => {
  const sentence = fix.split(/[.!?]/).filter(Boolean)[0] ?? fix;
  return sentence.length > 120 ? sentence.slice(0, 120) + "..." : sentence;
};

export const LessonCard = ({ lesson, onClick }: LessonCardProps) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick?.();
      }}
      className="rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3 mb-2">
        <Badge variant={severityVariant(lesson.severity)} className="shrink-0 capitalize">
          {lesson.severity}
        </Badge>
        <h3 className="text-sm font-medium leading-snug">{lesson.title}</h3>
      </div>

      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{fixPreview(lesson.fix)}</p>

      <div className="flex flex-wrap items-center gap-2">
        {lesson.stackTags.slice(0, 4).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs font-mono">
            {tag}
          </Badge>
        ))}
        {lesson.stackTags.length > 4 && (
          <span className="text-xs text-muted-foreground">+{lesson.stackTags.length - 4} more</span>
        )}
      </div>
    </div>
  );
};
