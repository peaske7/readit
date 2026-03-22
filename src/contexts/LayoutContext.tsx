import { createContext, type ReactNode, use, useMemo } from "react";
import { useEditorScheme } from "../hooks/useEditorScheme";
import { useFontPreference } from "../hooks/useFontPreference";
import { useKeybindings } from "../hooks/useKeybindings";
import { useLayoutMode } from "../hooks/useLayoutMode";
import { useThemePreference } from "../hooks/useThemePreference";
import type { ShortcutDefinition } from "../lib/shortcut-registry";
import type {
  EditorScheme,
  FontFamily,
  ShortcutBinding,
  ThemeMode,
} from "../types";

interface LayoutContextValue {
  isFullscreen: boolean;
  toggleLayoutMode: () => void;
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => Promise<void>;
  editorScheme: EditorScheme;
  setEditorScheme: (scheme: EditorScheme) => Promise<void>;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  shortcuts: ShortcutDefinition[];
  updateBinding: (id: string, binding: ShortcutBinding) => Promise<void>;
  toggleShortcutEnabled: (id: string) => Promise<void>;
  resetShortcutsToDefaults: () => Promise<void>;
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
  children: ReactNode;
}

export function LayoutProvider({ children }: LayoutProviderProps) {
  const { isFullscreen, toggleLayoutMode } = useLayoutMode();
  const { fontFamily, setFontFamily } = useFontPreference();
  const { editorScheme, setEditorScheme } = useEditorScheme();
  const { themeMode, setThemeMode } = useThemePreference();
  const {
    shortcuts,
    updateBinding,
    toggleEnabled: toggleShortcutEnabled,
    resetToDefaults: resetShortcutsToDefaults,
  } = useKeybindings();

  const value = useMemo<LayoutContextValue>(
    () => ({
      isFullscreen,
      toggleLayoutMode,
      fontFamily,
      setFontFamily,
      editorScheme,
      setEditorScheme,
      themeMode,
      setThemeMode,
      shortcuts,
      updateBinding,
      toggleShortcutEnabled,
      resetShortcutsToDefaults,
    }),
    [
      isFullscreen,
      toggleLayoutMode,
      fontFamily,
      setFontFamily,
      editorScheme,
      setEditorScheme,
      themeMode,
      setThemeMode,
      shortcuts,
      updateBinding,
      toggleShortcutEnabled,
      resetShortcutsToDefaults,
    ],
  );

  return <LayoutContext value={value}>{children}</LayoutContext>;
}
