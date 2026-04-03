import {
  bindingsEqual,
  DEFAULT_SHORTCUTS,
  resolveShortcuts,
  type ShortcutDefinition,
} from "../lib/shortcut-registry";
import type { KeybindingOverride, ShortcutBinding } from "../schema";

export const shortcutState = $state({
  shortcuts: DEFAULT_SHORTCUTS as ShortcutDefinition[],
});

export function initShortcuts(overrides: KeybindingOverride[]): void {
  shortcutState.shortcuts = resolveShortcuts(overrides);
}

export async function updateBinding(
  id: string,
  binding: ShortcutBinding,
): Promise<void> {
  const conflict = shortcutState.shortcuts.find(
    (s) => s.id !== id && s.enabled && bindingsEqual(s.binding, binding),
  );

  const updated = shortcutState.shortcuts.map((s) => {
    if (s.id === id) return { ...s, binding };
    if (conflict && s.id === conflict.id) {
      const current = shortcutState.shortcuts.find((x) => x.id === id);
      return { ...s, binding: current?.binding ?? s.defaultBinding };
    }
    return s;
  });

  shortcutState.shortcuts = updated;
  await persistOverrides(updated);
}

export async function toggleEnabled(id: string): Promise<void> {
  const target = shortcutState.shortcuts.find((s) => s.id === id);
  if (!target) return;

  // When re-enabling, check for binding conflicts with other enabled shortcuts
  if (!target.enabled) {
    const conflict = shortcutState.shortcuts.find(
      (s) =>
        s.id !== id && s.enabled && bindingsEqual(s.binding, target.binding),
    );
    if (conflict) {
      // Disable the conflicting shortcut to resolve the conflict
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
  try {
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keybindings: toOverrides(shortcuts) }),
    });
    if (!response.ok) {
      throw new Error(`Failed to save keybindings: ${response.status}`);
    }
  } catch (err) {
    console.error("Failed to save keybindings:", err);
  }
}
