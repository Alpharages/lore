"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CodeBlock } from "./code-block";
import { fetchPattern, deletePattern } from "@/lib/api";

export const PatternPanel = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const patternId = searchParams.get("pattern");

  const prevPatternIdRef = useRef<string | null>(null);
  if (patternId) prevPatternIdRef.current = patternId;
  const activeId = patternId ?? prevPatternIdRef.current;

  const [confirmOpen, setConfirmOpen] = useState(false);

  const {
    data: pattern,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["patterns", activeId],
    queryFn: () => fetchPattern(activeId!),
    enabled: Boolean(activeId),
  });

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("pattern");
    const qs = params.toString();
    router.replace(qs ? `/patterns?${qs}` : "/patterns", { scroll: false });
  }, [searchParams, router]);

  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: deletePattern,
    onSuccess: () => {
      toast.success("Pattern deleted");
      setConfirmOpen(false);
      handleClose();
      queryClient.invalidateQueries({ queryKey: ["patterns"] });
    },
    onError: () => {
      toast.error("Failed to delete pattern");
      setConfirmOpen(false);
    },
  });

  const open = Boolean(patternId);

  return (
    <>
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
              <SheetTitle className="sr-only">Pattern detail</SheetTitle>
              <SheetDescription className="sr-only">
                Failed to load pattern detail.
              </SheetDescription>
              <PanelError onClose={handleClose} />
            </>
          ) : isLoading || !pattern ? (
            <>
              <SheetTitle className="sr-only">Loading pattern</SheetTitle>
              <SheetDescription className="sr-only">Pattern detail is loading.</SheetDescription>
              <PanelSkeleton />
            </>
          ) : (
            <>
              <SheetHeader className="border-b border-border p-4 pb-3 flex flex-row items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-sm font-semibold leading-tight">
                    {pattern.title}
                  </SheetTitle>
                  <SheetDescription className="sr-only">{pattern.description}</SheetDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete pattern ${pattern.title}`}
                  onClick={() => setConfirmOpen(true)}
                  className="shrink-0 -mr-2 -mt-1"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </SheetHeader>

              <ScrollArea className="flex-1 min-h-0">
                <div className="p-4 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Description
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{pattern.description}</p>
                  </div>

                  {pattern.codeExample ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Code Example
                      </p>
                      <Suspense
                        fallback={<div className="h-24 rounded-md bg-muted animate-pulse" />}
                      >
                        <CodeBlock
                          code={pattern.codeExample}
                          language={pattern.codeLanguage ?? "typescript"}
                        />
                      </Suspense>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-1">
                    {pattern.stackTags.map((tag) => (
                      <Badge key={tag} variant="outline" className="font-mono text-[10px]">
                        {tag}
                      </Badge>
                    ))}
                    {pattern.category ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {pattern.category}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Usage Count
                      </p>
                      <p className="text-sm">{pattern.usageCount}</p>
                    </div>
                    {pattern.lastUsedAt ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Last Used
                        </p>
                        <p className="text-sm">
                          {formatDistanceToNow(new Date(pattern.lastUsedAt), { addSuffix: true })}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {pattern.externalTaskRef ? (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Source
                      </p>
                      {pattern.externalTrackerType === "clickup" ? (
                        <Link
                          href={`https://app.clickup.com/t/${pattern.externalTaskRef}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          ClickUp #{pattern.externalTaskRef}
                        </Link>
                      ) : (
                        <p className="text-sm">
                          {pattern.externalTrackerType ?? "tracker"}: {pattern.externalTaskRef}
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete pattern</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{pattern?.title}</strong>? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pattern) {
                  deleteMutation.mutate(pattern.id);
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const PanelSkeleton = () => (
  <div className="flex flex-col h-full">
    <div className="border-b border-border p-4 pb-3">
      <Skeleton className="h-5 w-full" />
    </div>
    <div className="p-4 space-y-4">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-12" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
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
        Could not load this pattern. It may have been removed or the ID is invalid.
      </p>
      <button type="button" onClick={onClose} className="text-sm text-primary hover:underline">
        Close panel
      </button>
    </div>
  </div>
);
