import { client } from "../lib/client";
import {
  bindingsEqual,
  DEFAULT_SHORTCUTS,
  resolveShortcuts,
  type ShortcutDefinition,
} from "../lib/shortcut-registry";
import type { KeybindingOverride, ShortcutBinding } from "../schema";

const KEYBINDINGS_STORAGE_KEY = "readit:keybindings";

export const shortcutState = $state({
  shortcuts: DEFAULT_SHORTCUTS as ShortcutDefinition[],
});

export function initShortcuts(overrides: KeybindingOverride[]): void {
  shortcutState.shortcuts = resolveShortcuts(
    client.capabilities.putSettings ? overrides : readStoredOverrides(),
  );
}

function readStoredOverrides(): KeybindingOverride[] {
  try {
    const raw = localStorage.getItem(KEYBINDINGS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Storage is user-writable; drop entries that are not shaped like overrides.
    return parsed.filter(
      (entry): entry is KeybindingOverride =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { id?: unknown }).id === "string" &&
        typeof (entry as { enabled?: unknown }).enabled === "boolean",
    );
  } catch {
    return [];
  }
}

export async function updateBinding(
  id: string,
  binding: ShortcutBinding,
): Promise<void> {
  const target = shortcutState.shortcuts.find((s) => s.id === id);
  const conflict = shortcutState.shortcuts.find(
    (s) => s.id !== id && s.enabled && bindingsEqual(s.binding, binding),
  );

  const updated = shortcutState.shortcuts.map((s) => {
    if (s.id === id) return { ...s, binding };
    if (conflict && s.id === conflict.id) {
      // Only swap bindings when the target is enabled; otherwise
      // just revert the conflicting shortcut to its default binding
      // to avoid creating two enabled shortcuts on the same combo.
      if (target?.enabled) {
        return { ...s, binding: target.binding };
      }
      return { ...s, binding: s.defaultBinding };
    }
    return s;
  });

  shortcutState.shortcuts = updated;
  await persistOverrides(updated);
}

export async function toggleEnabled(id: string): Promise<void> {
  const target = shortcutState.shortcuts.find((s) => s.id === id);
  if (!target) return;

  if (!target.enabled) {
    const conflict = shortcutState.shortcuts.find(
      (s) =>
        s.id !== id && s.enabled && bindingsEqual(s.binding, target.binding),
    );
    if (conflict) {
      shortcutState.shortcuts = shortcutState.shortcuts.map((s) => {
        if (s.id === id) return { ...s, enabled: true };
        if (s.id === conflict.id) return { ...s, enabled: false };
        return s;
      });
      await persistOverrides(shortcutState.shortcuts);
      return;
    }
  }

  shortcutState.shortcuts = shortcutState.shortcuts.map((s) =>
    s.id === id ? { ...s, enabled: !s.enabled } : s,
  );
  await persistOverrides(shortcutState.shortcuts);
}

export async function resetToDefaults(): Promise<void> {
  shortcutState.shortcuts = DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
  await persistOverrides(shortcutState.shortcuts);
}

function toOverrides(shortcuts: ShortcutDefinition[]): KeybindingOverride[] {
  return shortcuts
    .filter((s) => !s.enabled || !bindingsEqual(s.binding, s.defaultBinding))
    .map((s) => ({
      id: s.id,
      binding: bindingsEqual(s.binding, s.defaultBinding)
        ? undefined
        : s.binding,
      enabled: s.enabled,
    }));
}

async function persistOverrides(
  shortcuts: ShortcutDefinition[],
): Promise<void> {
  // Hosted snapshots have no settings endpoint; keep overrides per browser.
  if (!client.capabilities.putSettings) {
    try {
      localStorage.setItem(
        KEYBINDINGS_STORAGE_KEY,
        JSON.stringify(toOverrides(shortcuts)),
      );
    } catch {}
    return;
  }

  try {
    await client.putSettings({ keybindings: toOverrides(shortcuts) });
  } catch (err) {
    console.error("Failed to save keybindings:", err);
  }
}
