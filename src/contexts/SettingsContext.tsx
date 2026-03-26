import { createContext, type ReactNode, use, useMemo } from "react";
import { useFontPreference } from "../hooks/useFontPreference";
import { useThemePreference } from "../hooks/useThemePreference";
import type { FontFamily, ThemeMode } from "../types";

interface SettingsContextValue {
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => Promise<void>;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const value = use(SettingsContext);
  if (!value) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return value;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { fontFamily, setFontFamily } = useFontPreference();
  const { themeMode, setThemeMode } = useThemePreference();

  const value = useMemo<SettingsContextValue>(
    () => ({ fontFamily, setFontFamily, themeMode, setThemeMode }),
    [fontFamily, setFontFamily, themeMode, setThemeMode],
  );

  return <SettingsContext value={value}>{children}</SettingsContext>;
}
