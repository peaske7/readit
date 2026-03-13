import type { KeybindingOverride, ShortcutBinding } from "../types";

export type { ShortcutBinding, KeybindingOverride };

export const ShortcutActions = {
  COPY_ALL: "copyAll",
  COPY_ALL_RAW: "copyAllRaw",
  NAVIGATE_NEXT: "navigateNext",
  NAVIGATE_PREVIOUS: "navigatePrevious",
  COPY_SELECTION_RAW: "copySelectionRaw",
  COPY_SELECTION_LLM: "copySelectionLLM",
  CLEAR_SELECTION: "clearSelection",
} as const;

export type ShortcutAction =
  (typeof ShortcutActions)[keyof typeof ShortcutActions];

export interface ShortcutDefinition {
  id: ShortcutAction;
  label: string;
  description: string;
  defaultBinding: ShortcutBinding;
  binding: ShortcutBinding; // resolved (default or user override)
  enabled: boolean;
}

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: ShortcutActions.COPY_ALL,
    label: "Copy All (AI)",
    description: "Copy all comments in AI prompt format",
    defaultBinding: { key: "c", alt: true },
    binding: { key: "c", alt: true },
    enabled: true,
  },
  {
    id: ShortcutActions.COPY_ALL_RAW,
    label: "Copy All (Raw)",
    description: "Copy all comments as raw text",
    defaultBinding: { key: "c", alt: true, shift: true },
    binding: { key: "c", alt: true, shift: true },
    enabled: true,
  },
  {
    id: ShortcutActions.NAVIGATE_NEXT,
    label: "Next Comment",
    description: "Navigate to next comment",
    defaultBinding: { key: "ArrowDown", alt: true },
    binding: { key: "ArrowDown", alt: true },
    enabled: true,
  },
  {
    id: ShortcutActions.NAVIGATE_PREVIOUS,
    label: "Previous Comment",
    description: "Navigate to previous comment",
    defaultBinding: { key: "ArrowUp", alt: true },
    binding: { key: "ArrowUp", alt: true },
    enabled: true,
  },
  {
    id: ShortcutActions.COPY_SELECTION_RAW,
    label: "Copy Selection",
    description: "Copy selected text",
    defaultBinding: { key: "c", meta: true },
    binding: { key: "c", meta: true },
    enabled: true,
  },
  {
    id: ShortcutActions.COPY_SELECTION_LLM,
    label: "Copy Selection (LLM)",
    description: "Copy selected text with context for LLM",
    defaultBinding: { key: "c", meta: true, shift: true },
    binding: { key: "c", meta: true, shift: true },
    enabled: true,
  },
  {
    id: ShortcutActions.CLEAR_SELECTION,
    label: "Clear Selection",
    description: "Clear text selection",
    defaultBinding: { key: "Escape" },
    binding: { key: "Escape" },
    enabled: true,
  },
];

/**
 * Check if a KeyboardEvent matches a ShortcutBinding.
 * All modifier flags must match exactly (no extra modifiers allowed).
 */
export function matchesBinding(
  event: KeyboardEvent,
  binding: ShortcutBinding,
): boolean {
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;
  if (event.altKey !== (binding.alt ?? false)) return false;
  if (event.metaKey !== (binding.meta ?? false)) return false;
  if (event.shiftKey !== (binding.shift ?? false)) return false;
  return true;
}

const KEY_DISPLAY: Record<string, string> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  " ": "Space",
  Enter: "Enter",
};

/**
 * Format a ShortcutBinding for display.
 * Shows ⌘ on Mac, Ctrl on other platforms.
 */
export function formatBinding(
  binding: ShortcutBinding,
  isMac: boolean,
): string {
  const parts: string[] = [];

  if (binding.meta) parts.push(isMac ? "⌘" : "Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");

  const keyDisplay = KEY_DISPLAY[binding.key] ?? binding.key.toUpperCase();
  parts.push(keyDisplay);

  return parts.join("+");
}

/**
 * Merge user overrides with default shortcuts.
 * Unknown override IDs are ignored.
 */
export function resolveShortcuts(
  overrides: KeybindingOverride[],
): ShortcutDefinition[] {
  if (overrides.length === 0) return DEFAULT_SHORTCUTS;

  const overrideMap = new Map(overrides.map((o) => [o.id, o]));

  return DEFAULT_SHORTCUTS.map((shortcut) => {
    const override = overrideMap.get(shortcut.id);
    if (!override) return shortcut;

    return {
      ...shortcut,
      binding: override.binding ?? shortcut.defaultBinding,
      enabled: override.enabled,
    };
  });
}

/**
 * Browser-reserved key combos that cannot be rebound.
 */
export const RESERVED_BINDINGS: ShortcutBinding[] = [
  { key: "w", meta: true },
  { key: "t", meta: true },
  { key: "n", meta: true },
  { key: "q", meta: true },
  { key: "l", meta: true },
  { key: "r", meta: true },
  { key: "F5" },
  { key: "F11" },
  { key: "F12" },
];

/**
 * Check if a binding conflicts with browser-reserved shortcuts.
 */
export function isReservedBinding(binding: ShortcutBinding): boolean {
  return RESERVED_BINDINGS.some(
    (reserved) =>
      reserved.key.toLowerCase() === binding.key.toLowerCase() &&
      (reserved.meta ?? false) === (binding.meta ?? false) &&
      (reserved.alt ?? false) === (binding.alt ?? false) &&
      (reserved.shift ?? false) === (binding.shift ?? false),
  );
}

/**
 * Convert a KeyboardEvent to a ShortcutBinding (for the capture UI).
 */
export function eventToBinding(
  event: KeyboardEvent,
): ShortcutBinding | undefined {
  // Ignore standalone modifier keys
  if (["Alt", "Shift", "Control", "Meta"].includes(event.key)) return undefined;

  const binding: ShortcutBinding = { key: event.key };
  if (event.altKey) binding.alt = true;
  if (event.metaKey) binding.meta = true;
  if (event.shiftKey) binding.shift = true;

  return binding;
}

/**
 * Check if two bindings are equal.
 */
export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    (a.alt ?? false) === (b.alt ?? false) &&
    (a.meta ?? false) === (b.meta ?? false) &&
    (a.shift ?? false) === (b.shift ?? false)
  );
}
