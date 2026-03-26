import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import {
  resolveShortcuts,
  type ShortcutDefinition,
} from "../lib/shortcut-registry";
import {
  FontFamilies,
  type FontFamily,
  type KeybindingOverride,
  type ShortcutBinding,
  type ThemeMode,
  ThemeModes,
} from "../schema";

const THEME_STORAGE_KEY = "readit:theme";
const DARK_MQ = "(prefers-color-scheme: dark)";

function getStoredTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (
      stored === ThemeModes.LIGHT ||
      stored === ThemeModes.DARK ||
      stored === ThemeModes.SYSTEM
    ) {
      return stored;
    }
  } catch {}
  return ThemeModes.SYSTEM;
}

function applyTheme(mode: ThemeMode): void {
  const isDark =
    mode === ThemeModes.DARK ||
    (mode === ThemeModes.SYSTEM && window.matchMedia(DARK_MQ).matches);

  document.documentElement.classList.toggle("dark", isDark);
}

interface SettingsContextValue {
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => Promise<void>;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  shortcuts: ShortcutDefinition[];
  updateBinding: (id: string, binding: ShortcutBinding) => Promise<void>;
  toggleShortcutEnabled: (id: string) => Promise<void>;
  resetShortcutsToDefaults: () => Promise<void>;
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
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(
    FontFamilies.SERIF,
  );
  const [overrides, setOverrides] = useState<KeybindingOverride[]>([]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const settings = await response.json();
          setFontFamilyState(settings.fontFamily || FontFamilies.SERIF);
          setOverrides(settings.keybindings ?? []);
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      }
    };

    fetchSettings();
  }, []);

  const setFontFamily = useCallback(async (font: FontFamily) => {
    setFontFamilyState(font);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontFamily: font }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }
    } catch (err) {
      console.error("Failed to save font preference:", err);
      toast.error("Failed to save font preference");
    }
  }, []);

  // --- Theme ---

  const [themeMode, setThemeModeState] = useState<ThemeMode>(getStoredTheme);

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

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
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {}
  }, []);

  // --- Keyboard Shortcuts ---

  const shortcuts = useMemo(() => resolveShortcuts(overrides), [overrides]);

  const persistOverrides = useCallback(
    async (newOverrides: KeybindingOverride[]) => {
      try {
        const response = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keybindings: newOverrides }),
        });

        if (!response.ok) {
          throw new Error("Failed to save keybindings");
        }
      } catch (err) {
        console.error("Failed to save keybindings:", err);
        toast.error("Failed to save keybindings");
      }
    },
    [],
  );

  const updateBinding = useCallback(
    async (id: string, binding: ShortcutBinding) => {
      const newOverrides = overrides.filter((o) => o.id !== id);
      newOverrides.push({ id, binding, enabled: true });

      setOverrides(newOverrides);
      await persistOverrides(newOverrides);
    },
    [overrides, persistOverrides],
  );

  const toggleShortcutEnabled = useCallback(
    async (id: string) => {
      const existing = overrides.find((o) => o.id === id);
      const currentEnabled = existing?.enabled ?? true;
      const newOverrides = overrides.filter((o) => o.id !== id);
      newOverrides.push({
        id,
        binding: existing?.binding,
        enabled: !currentEnabled,
      });

      setOverrides(newOverrides);
      await persistOverrides(newOverrides);
    },
    [overrides, persistOverrides],
  );

  const resetShortcutsToDefaults = useCallback(async () => {
    setOverrides([]);
    await persistOverrides([]);
  }, [persistOverrides]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      fontFamily,
      setFontFamily,
      themeMode,
      setThemeMode,
      shortcuts,
      updateBinding,
      toggleShortcutEnabled,
      resetShortcutsToDefaults,
    }),
    [
      fontFamily,
      setFontFamily,
      themeMode,
      setThemeMode,
      shortcuts,
      updateBinding,
      toggleShortcutEnabled,
      resetShortcutsToDefaults,
    ],
  );

  return <SettingsContext value={value}>{children}</SettingsContext>;
}
