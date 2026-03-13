import { useCallback, useEffect, useState } from "react";
import { type ThemeMode, ThemeModes } from "../types";

const STORAGE_KEY = "readit:theme";

const DARK_MQ = "(prefers-color-scheme: dark)";

function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (
      stored === ThemeModes.LIGHT ||
      stored === ThemeModes.DARK ||
      stored === ThemeModes.SYSTEM
    ) {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return ThemeModes.SYSTEM;
}

function applyTheme(mode: ThemeMode): void {
  const isDark =
    mode === ThemeModes.DARK ||
    (mode === ThemeModes.SYSTEM && window.matchMedia(DARK_MQ).matches);

  document.documentElement.classList.toggle("dark", isDark);
}

interface UseThemePreferenceResult {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export function useThemePreference(): UseThemePreferenceResult {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(getStoredTheme);

  // Apply theme class whenever mode changes
  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (themeMode !== ThemeModes.SYSTEM) return;

    const mq = window.matchMedia(DARK_MQ);
    const handler = () => applyTheme(ThemeModes.SYSTEM);

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeMode]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  return { themeMode, setThemeMode };
}
