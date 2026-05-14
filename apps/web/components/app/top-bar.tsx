"use client";

import { usePathname } from "next/navigation";
import { ProjectSwitcher } from "@/components/app/project-switcher";
import { ThemeToggle } from "@/components/app/theme-toggle";

const pageTitles: Record<string, string> = {
  "/lessons": "Lessons",
  "/inbox": "Inbox",
  "/dashboard": "Dashboard",
  "/admin": "Admin",
};

export const TopBar = () => {
  const pathname = usePathname();
  const title = pageTitles[pathname] ?? "";

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6 bg-background">
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="flex items-center gap-2">
        <ProjectSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
};

export default TopBar;
