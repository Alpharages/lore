"use client";

import { Skeleton } from "@/components/ui/skeleton";

export const LessonCardSkeleton = () => {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-full" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
    </div>
  );
};

export const LessonCardSkeletonList = ({ count = 5 }: { count?: number }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <LessonCardSkeleton key={i} />
      ))}
    </div>
  );
};
