"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@/components/ui/command";
import { fetchLessons } from "@/lib/api";
import { useDebounce } from "@/hooks/use-debounce";
import { SeverityBadge } from "@/components/app/severity-badge";
import type { Lesson } from "@/lib/api-types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const router = useRouter();

  const { data, isError } = useQuery({
    queryKey: ["lessons", "palette", debouncedQuery],
    queryFn: () => fetchLessons({ q: debouncedQuery }),
    enabled: debouncedQuery.length >= 2,
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setQuery("");
    onOpenChange(nextOpen);
  };

  const handleSelect = (lesson: Lesson) => {
    handleOpenChange(false);
    router.push(`/lessons?q=${encodeURIComponent(debouncedQuery)}&lesson=${lesson.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 shadow-2xl gap-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search lessons..."
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList>
            {isError && (
              <div className="py-6 text-center text-sm text-red-500">Search unavailable.</div>
            )}
            {!isError && debouncedQuery.length >= 2 && data?.length === 0 && (
              <CommandEmpty>No lessons found.</CommandEmpty>
            )}
            {!isError &&
              data?.map((lesson) => (
                <CommandItem
                  key={lesson.id}
                  onSelect={() => handleSelect(lesson)}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                >
                  <SeverityBadge severity={lesson.severity} />
                  <span className="font-medium text-sm truncate flex-1">{lesson.title}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[320px]">
                    {lesson.fix?.slice(0, 80)}
                  </span>
                </CommandItem>
              ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
