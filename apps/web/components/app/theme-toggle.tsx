"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";

const nextTheme = {
  system: "light" as const,
  light: "dark" as const,
  dark: "system" as const,
};

const themeIcon = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const themeLabel = {
  system: "Switch to light theme",
  light: "Switch to dark theme",
  dark: "Switch to system theme",
};

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const Icon = themeIcon[theme];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={themeLabel[theme]}
      onClick={() => setTheme(nextTheme[theme])}
    >
      <Icon className="size-4" />
    </Button>
  );
};
