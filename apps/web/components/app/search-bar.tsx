"use client";

import { forwardRef, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  count?: number;
  isError?: boolean;
  onRetry?: () => void;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(
  ({ value, onChange, count, isError, onRetry }, ref) => {
    useEffect(() => {
      if (ref && typeof ref === "object" && ref.current) {
        ref.current.focus();
      }
    }, [ref]);

    return (
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search lessons..."
            className="pl-9 text-base"
            aria-label="Search lessons"
          />
        </div>

        {typeof count === "number" && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {count} {count === 1 ? "lesson" : "lessons"}
          </p>
        )}

        {isError && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-destructive">Search unavailable.</span>
            <Button variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </div>
    );
  }
);

SearchBar.displayName = "SearchBar";
