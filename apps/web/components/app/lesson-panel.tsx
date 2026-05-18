"use client";

import { Suspense, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { SeverityBadge } from "./severity-badge";
import { CodeBlock } from "./code-block";
import { fetchLesson } from "@/lib/api";

interface LessonPanelProps {
  searchBarRef: React.RefObject<HTMLInputElement | null>;
}

const ProvenanceLabel = {
  code_review: "From review",
  manual: "Manual",
  propagated: "Propagated",
} as const;

export const LessonPanel = ({ searchBarRef }: LessonPanelProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const lessonId = searchParams.get("lesson");

  // Retain the last active ID so the panel shows lesson content during the close animation
  // rather than flashing to a skeleton while the sheet slides out.
  const prevLessonIdRef = useRef<string | null>(null);
  if (lessonId) prevLessonIdRef.current = lessonId;
  const activeId = lessonId ?? prevLessonIdRef.current;

  const {
    data: lesson,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["lessons", activeId],
    queryFn: () => fetchLesson(activeId!),
    enabled: Boolean(activeId),
  });

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("lesson");
    const qs = params.toString();
    router.replace(qs ? `/lessons?${qs}` : "/lessons", { scroll: false });
    setTimeout(() => {
      searchBarRef.current?.focus();
    }, 200);
  }, [searchParams, router, searchBarRef]);

  const open = Boolean(lessonId);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] bg-card [&[data-state=open]]:duration-200 [&[data-state=closed]]:duration-200 p-0"
      >
        {isError ? (
          <>
            <SheetTitle className="sr-only">Lesson detail</SheetTitle>
            <SheetDescription className="sr-only">Failed to load lesson detail.</SheetDescription>
            <PanelError onClose={handleClose} />
          </>
        ) : isLoading || !lesson ? (
          <>
            <SheetTitle className="sr-only">Loading lesson</SheetTitle>
            <SheetDescription className="sr-only">Lesson detail is loading.</SheetDescription>
            <PanelSkeleton />
          </>
        ) : (
          <>
            <SheetHeader className="border-b border-border p-4 pb-3">
              <div className="flex items-start gap-2 pr-8">
                <SeverityBadge severity={lesson.severity} />
                <SheetTitle className="text-sm font-semibold leading-tight">
                  {lesson.title}
                </SheetTitle>
              </div>
              <SheetDescription className="sr-only">{lesson.problem}</SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="fix" className="flex flex-col flex-1 min-h-0">
              <TabsList className="mx-4 mt-3 mb-0 shrink-0" variant="line">
                <TabsTrigger value="fix">Fix</TabsTrigger>
                <TabsTrigger value="context">Context</TabsTrigger>
                {lesson.code ? <TabsTrigger value="code">Code</TabsTrigger> : null}
                <TabsTrigger value="provenance">Provenance</TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 pt-3">
                  <TabsContent value="fix" className="mt-0 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Prevention Rule
                      </p>
                      <p className="text-sm font-semibold">{lesson.preventionRule}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Fix
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{lesson.fix}</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="context" className="mt-0 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Problem
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{lesson.problem}</p>
                    </div>
                    {lesson.rootCause ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Root Cause
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{lesson.rootCause}</p>
                      </div>
                    ) : null}
                  </TabsContent>

                  {lesson.code ? (
                    <TabsContent value="code" className="mt-0">
                      <Suspense
                        fallback={<div className="h-24 rounded-md bg-muted animate-pulse" />}
                      >
                        <CodeBlock code={lesson.code} language={lesson.language} />
                      </Suspense>
                    </TabsContent>
                  ) : null}

                  <TabsContent value="provenance" className="mt-0 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Source
                        </p>
                        <p className="text-sm">
                          {ProvenanceLabel[lesson.provenance] ?? lesson.provenance}
                        </p>
                      </div>
                      {lesson.trustTier ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            Trust Tier
                          </p>
                          <p className="text-sm">{lesson.trustTier}</p>
                        </div>
                      ) : null}
                      {typeof lesson.occurrenceCount === "number" ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            Occurrences
                          </p>
                          <p className="text-sm">{lesson.occurrenceCount}</p>
                        </div>
                      ) : null}
                    </div>

                    {lesson.sessionId ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Session
                        </p>
                        <Link
                          href={`/lessons?q=${encodeURIComponent(lesson.sessionId)}`}
                          className="text-sm text-primary hover:underline"
                        >
                          {lesson.sessionId}
                        </Link>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      {lesson.firstSeen ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            First Seen
                          </p>
                          <p className="text-sm">
                            {formatDistanceToNow(new Date(lesson.firstSeen), { addSuffix: true })}
                          </p>
                        </div>
                      ) : null}
                      {lesson.lastSeen ? (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                            Last Seen
                          </p>
                          <p className="text-sm">
                            {formatDistanceToNow(new Date(lesson.lastSeen), { addSuffix: true })}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

const PanelSkeleton = () => (
  <div className="flex flex-col h-full">
    <div className="border-b border-border p-4 pb-3">
      <div className="flex items-start gap-2 pr-8">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-full" />
      </div>
    </div>
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-12" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  </div>
);

const PanelError = ({ onClose }: { onClose: () => void }) => (
  <div className="flex flex-col h-full">
    <div className="border-b border-border p-4 pb-3">
      <h2 className="text-sm font-semibold">Error</h2>
    </div>
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
      <p className="text-sm text-muted-foreground">
        Could not load this lesson. It may have been removed or the ID is invalid.
      </p>
      <button type="button" onClick={onClose} className="text-sm text-primary hover:underline">
        Close panel
      </button>
    </div>
  </div>
);
