import {
  FontFamilies,
  type FontFamily,
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
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
  }
  return ThemeModes.SYSTEM;
}

function applyTheme(mode: ThemeMode): void {
  const isDark =
    mode === ThemeModes.DARK ||
    (mode === ThemeModes.SYSTEM && window.matchMedia(DARK_MQ).matches);

  document.documentElement.classList.toggle("dark", isDark);
}

export const settings = $state({
  fontFamily: FontFamilies.SERIF as FontFamily,
  themeMode: getStoredTheme() as ThemeMode,
});

export async function updateFontFamily(font: FontFamily): Promise<void> {
  settings.fontFamily = font;

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
  }
}

export function updateThemeMode(mode: ThemeMode): void {
  settings.themeMode = mode;
  applyTheme(mode);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable
  }
}

export function initSettings(data?: { fontFamily?: string }): void {
  if (data?.fontFamily) {
    settings.fontFamily = data.fontFamily as FontFamily;
  }

  applyTheme(settings.themeMode);
  syncSystemPreference();
}

let mediaCleanup: (() => void) | undefined;

function syncSystemPreference(): void {
  if (mediaCleanup) {
    mediaCleanup();
  }

  if (settings.themeMode !== ThemeModes.SYSTEM) return;

  const mq = window.matchMedia(DARK_MQ);
  const handler = () => applyTheme(ThemeModes.SYSTEM);

  mq.addEventListener("change", handler);
  mediaCleanup = () => mq.removeEventListener("change", handler);
}
