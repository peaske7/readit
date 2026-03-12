import { useCallback, useState } from "react";
import { type LayoutMode, LayoutModes } from "../types";

const STORAGE_KEY = "readit:layout-mode";

interface UseLayoutModeResult {
  layoutMode: LayoutMode;
  toggleLayoutMode: () => void;
  isFullscreen: boolean;
}

export function useLayoutMode(): UseLayoutModeResult {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === LayoutModes.FULLSCREEN
        ? LayoutModes.FULLSCREEN
        : LayoutModes.CENTERED;
    } catch {
      return LayoutModes.CENTERED;
    }
  });

  const toggleLayoutMode = useCallback(() => {
    setLayoutMode((prev) => {
      const next =
        prev === LayoutModes.CENTERED
          ? LayoutModes.FULLSCREEN
          : LayoutModes.CENTERED;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // localStorage may be unavailable
      }
      return next;
    });
  }, []);

  return {
    layoutMode,
    toggleLayoutMode,
    isFullscreen: layoutMode === LayoutModes.FULLSCREEN,
  };
}
