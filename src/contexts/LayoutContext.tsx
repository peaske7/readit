import { createContext, type ReactNode, use, useMemo } from "react";
import { useFontPreference } from "../hooks/useFontPreference";
import { useLayoutMode } from "../hooks/useLayoutMode";
import type { FontFamily } from "../types";

interface LayoutContextValue {
  isFullscreen: boolean;
  toggleLayoutMode: () => void;
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => Promise<void>;
}

export const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayoutContext(): LayoutContextValue {
  const value = use(LayoutContext);
  if (!value) {
    throw new Error("useLayoutContext must be used within a LayoutProvider");
  }
  return value;
}

interface LayoutProviderProps {
  filePath: string;
  children: ReactNode;
}

export function LayoutProvider({ filePath, children }: LayoutProviderProps) {
  const { isFullscreen, toggleLayoutMode } = useLayoutMode();
  const { fontFamily, setFontFamily } = useFontPreference(filePath);

  const value = useMemo<LayoutContextValue>(
    () => ({ isFullscreen, toggleLayoutMode, fontFamily, setFontFamily }),
    [isFullscreen, toggleLayoutMode, fontFamily, setFontFamily],
  );

  return <LayoutContext value={value}>{children}</LayoutContext>;
}
