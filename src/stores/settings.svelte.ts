import { apiUrl } from "../lib/api";
import {
  FontFamilies,
  type FontFamily,
  type TableMode,
  TableModes,
  type ThemeMode,
  ThemeModes,
} from "../schema";
import { app } from "./app.svelte";

const THEME_STORAGE_KEY = "readit:theme";
const FONT_STORAGE_KEY = "readit:fontFamily";
const TABLE_MODE_STORAGE_KEY = "readit:tableMode";
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

function getStoredTableMode(): TableMode {
  try {
    const stored = localStorage.getItem(TABLE_MODE_STORAGE_KEY);
    if (
      stored === TableModes.AUTO ||
      stored === TableModes.FIT ||
      stored === TableModes.WIDE
    ) {
      return stored;
    }
  } catch {}
  return TableModes.AUTO;
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
  tableMode: getStoredTableMode() as TableMode,
});

export async function updateFontFamily(font: FontFamily): Promise<void> {
  settings.fontFamily = font;

  // Hosted snapshots have no settings endpoint; remember the choice per browser.
  if (app.hosted) {
    try {
      localStorage.setItem(FONT_STORAGE_KEY, font);
    } catch {}
    return;
  }

  try {
    const response = await fetch(apiUrl("/api/settings"), {
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
  syncSystemPreference();

  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {}
}

export function updateTableMode(mode: TableMode): void {
  settings.tableMode = mode;
  try {
    localStorage.setItem(TABLE_MODE_STORAGE_KEY, mode);
  } catch {}
}

export function initSettings(data?: { fontFamily?: string }): void {
  if (data?.fontFamily) {
    settings.fontFamily = data.fontFamily as FontFamily;
  }

  if (app.hosted) {
    try {
      const stored = localStorage.getItem(FONT_STORAGE_KEY);
      if (stored === FontFamilies.SERIF || stored === FontFamilies.SANS_SERIF) {
        settings.fontFamily = stored;
      }
    } catch {}
  }

  applyTheme(settings.themeMode);
  syncSystemPreference();
}

let mediaCleanup: (() => void) | undefined;

function syncSystemPreference(): void {
  if (mediaCleanup) {
    mediaCleanup();
    mediaCleanup = undefined;
  }

  if (settings.themeMode !== ThemeModes.SYSTEM) return;

  const mq = window.matchMedia(DARK_MQ);
  const handler = () => applyTheme(ThemeModes.SYSTEM);

  mq.addEventListener("change", handler);
  mediaCleanup = () => mq.removeEventListener("change", handler);
}
