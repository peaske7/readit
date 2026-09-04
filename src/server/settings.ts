import { createKeyLock } from "../lib/key-lock.js";
import {
  readSettings,
  settingsPath,
  writeSettings,
} from "../lib/readit-home.js";
import { ShortcutActions } from "../lib/shortcut-registry.js";
import {
  type DocumentSettings,
  FontFamilies,
  type FontFamily,
  type KeybindingOverride,
  type ShortcutBinding,
  type TableMode,
  TableModes,
  type ThemeMode,
  ThemeModes,
} from "../schema.js";

const withSettingsLock = createKeyLock("settings");

const KNOWN_SHORTCUT_IDS: ReadonlySet<string> = new Set(
  Object.values(ShortcutActions),
);

export function isValidFontFamily(value: unknown): value is FontFamily {
  return value === FontFamilies.SERIF || value === FontFamilies.SANS_SERIF;
}

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return Object.values<string>(ThemeModes).includes(value as string);
}

export function isValidTableMode(value: unknown): value is TableMode {
  return Object.values<string>(TableModes).includes(value as string);
}

function isOptionalBool(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function isValidShortcutBinding(value: unknown): value is ShortcutBinding {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  if (typeof b.key !== "string" || b.key.length === 0) return false;
  return (
    isOptionalBool(b.alt) &&
    isOptionalBool(b.ctrl) &&
    isOptionalBool(b.meta) &&
    isOptionalBool(b.shift)
  );
}

export function isValidKeybindings(
  value: unknown,
): value is KeybindingOverride[] {
  if (!Array.isArray(value)) return false;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return false;
    const o = entry as Record<string, unknown>;
    if (typeof o.id !== "string" || !KNOWN_SHORTCUT_IDS.has(o.id)) return false;
    if (typeof o.enabled !== "boolean") return false;
    if (o.binding !== undefined && !isValidShortcutBinding(o.binding)) {
      return false;
    }
  }
  return true;
}

export interface SettingsPatch {
  fontFamily?: FontFamily;
  themeMode?: ThemeMode;
  tableMode?: TableMode;
  keybindings?: KeybindingOverride[];
}

/** Merge a validated patch into the stored settings. */
export async function updateSettings(
  patch: SettingsPatch,
): Promise<DocumentSettings> {
  return withSettingsLock(settingsPath(), async () => {
    const current = await readSettings();
    const merged: DocumentSettings = {
      ...current,
      ...(patch.fontFamily !== undefined && { fontFamily: patch.fontFamily }),
      ...(patch.themeMode !== undefined && { themeMode: patch.themeMode }),
      ...(patch.tableMode !== undefined && { tableMode: patch.tableMode }),
      ...(patch.keybindings !== undefined && {
        keybindings: patch.keybindings,
      }),
    };
    await writeSettings(merged);
    return merged;
  });
}
