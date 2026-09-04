import { client } from "../lib/client";
import {
  FontFamilies,
  type FontFamily,
  type TableMode,
  TableModes,
  type ThemeMode,
  ThemeModes,
} from "../schema";

const THEME_STORAGE_KEY = "readit:theme";
const FONT_STORAGE_KEY = "readit:fontFamily";
const TABLE_MODE_STORAGE_KEY = "readit:tableMode";
const DARK_MQ = "(prefers-color-scheme: dark)";

function isThemeMode(value: unknown): value is ThemeMode {
  return Object.values<string>(ThemeModes).includes(value as string);
}

function isTableMode(value: unknown): value is TableMode {
  return Object.values<string>(TableModes).includes(value as string);
}

function readLocal(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function getStoredTheme(): ThemeMode {
  const stored = readLocal(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : ThemeModes.SYSTEM;
}

function getStoredTableMode(): TableMode {
  const stored = readLocal(TABLE_MODE_STORAGE_KEY);
  return isTableMode(stored) ? stored : TableModes.AUTO;
}

/**
 * localStorage is per origin, and editor integrations start the local server
 * on a fresh port each time, so the server's settings file is the durable copy.
 * localStorage stays as the pre-paint hint and the hosted-mode fallback.
 */
async function persist(
  update: Parameters<typeof client.putSettings>[0],
): Promise<void> {
  if (!client.capabilities.putSettings) return;
  try {
    await client.putSettings(update);
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
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
  if (!client.capabilities.putSettings) {
    try {
      localStorage.setItem(FONT_STORAGE_KEY, font);
    } catch {}
    return;
  }

  try {
    await client.putSettings({ fontFamily: font });
  } catch (err) {
    console.error("Failed to save font preference:", err);
  }
}

export function updateThemeMode(mode: ThemeMode): void {
  settings.themeMode = mode;
  applyTheme(mode);
  syncSystemPreference();
  writeLocal(THEME_STORAGE_KEY, mode);
  void persist({ themeMode: mode });
}

export function updateTableMode(mode: TableMode): void {
  settings.tableMode = mode;
  writeLocal(TABLE_MODE_STORAGE_KEY, mode);
  void persist({ tableMode: mode });
}

export function initSettings(data?: {
  fontFamily?: string;
  themeMode?: string;
  tableMode?: string;
}): void {
  if (data?.fontFamily) {
    settings.fontFamily = data.fontFamily as FontFamily;
  }
  if (isThemeMode(data?.themeMode)) {
    settings.themeMode = data.themeMode;
    writeLocal(THEME_STORAGE_KEY, data.themeMode);
  }
  if (isTableMode(data?.tableMode)) {
    settings.tableMode = data.tableMode;
    writeLocal(TABLE_MODE_STORAGE_KEY, data.tableMode);
  }

  if (!client.capabilities.putSettings) {
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
