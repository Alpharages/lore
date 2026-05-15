"use client";

import { useState, useEffect } from "react";
import { CommandPalette } from "./command-palette";

export const GlobalKeyboardHandler = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />;
};
