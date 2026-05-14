"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Inbox, BarChart2, Settings } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/use-project";
import { fetchPropagationCount } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { href: "/lessons", label: "Lessons", icon: BookOpen },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard", label: "Dashboard", icon: BarChart2 },
  { href: "/admin", label: "Admin", icon: Settings },
];

export const AppSidebar = () => {
  const pathname = usePathname();
  const { projectSlug } = useProject();

  const { data: count } = useQuery({
    queryKey: ["propagations", "count", projectSlug],
    queryFn: () => fetchPropagationCount(projectSlug === "all" ? undefined : projectSlug),
    refetchOnWindowFocus: false,
  });

  return (
    <nav className="w-[52px] flex flex-col items-center py-3 gap-1 border-r border-border bg-background flex-shrink-0">
      <div className="mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          L
        </div>
      </div>
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        const showBadge = item.href === "/inbox" && typeof count === "number" && count > 0;
        return (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>
              <Link
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-5" strokeWidth={1.5} />
                {showBadge ? (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
};

export default AppSidebar;
