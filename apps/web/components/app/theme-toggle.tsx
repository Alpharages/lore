"use client";

import { useEffect, useState } from "react";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render a stable placeholder on the server and first client render —
  // localStorage isn't available during SSR, so the real theme value can
  // only be trusted after mount. Avoids hydration mismatch (story 12.6 F4).
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" suppressHydrationWarning>
        <Monitor className="size-4" />
      </Button>
    );
  }

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
