import type { KeybindingOverride, ShortcutBinding } from "../schema";
import type { TranslationKey } from "./i18n/types";

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
  label: TranslationKey;
  description: TranslationKey;
  defaultBinding: ShortcutBinding;
  binding: ShortcutBinding;
  enabled: boolean;
}

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: ShortcutActions.COPY_ALL,
    label: "shortcut.copyAll.label",
    description: "shortcut.copyAll.description",
    defaultBinding: { key: "c", alt: true },
    binding: { key: "c", alt: true },
    enabled: true,
  },
  {
    id: ShortcutActions.COPY_ALL_RAW,
    label: "shortcut.copyAllRaw.label",
    description: "shortcut.copyAllRaw.description",
    defaultBinding: { key: "c", alt: true, shift: true },
    binding: { key: "c", alt: true, shift: true },
    enabled: true,
  },
  {
    id: ShortcutActions.NAVIGATE_NEXT,
    label: "shortcut.navigateNext.label",
    description: "shortcut.navigateNext.description",
    defaultBinding: { key: "ArrowDown", alt: true },
    binding: { key: "ArrowDown", alt: true },
    enabled: true,
  },
  {
    id: ShortcutActions.NAVIGATE_PREVIOUS,
    label: "shortcut.navigatePrevious.label",
    description: "shortcut.navigatePrevious.description",
    defaultBinding: { key: "ArrowUp", alt: true },
    binding: { key: "ArrowUp", alt: true },
    enabled: true,
  },
  {
    id: ShortcutActions.COPY_SELECTION_RAW,
    label: "shortcut.copySelectionRaw.label",
    description: "shortcut.copySelectionRaw.description",
    defaultBinding: { key: "c", meta: true, shift: true },
    binding: { key: "c", meta: true, shift: true },
    enabled: true,
  },
  {
    id: ShortcutActions.COPY_SELECTION_LLM,
    label: "shortcut.copySelectionLLM.label",
    description: "shortcut.copySelectionLLM.description",
    defaultBinding: { key: "c", meta: true, alt: true },
    binding: { key: "c", meta: true, alt: true },
    enabled: true,
  },
  {
    id: ShortcutActions.CLEAR_SELECTION,
    label: "shortcut.clearSelection.label",
    description: "shortcut.clearSelection.description",
    defaultBinding: { key: "Escape" },
    binding: { key: "Escape" },
    enabled: true,
  },
];

export function matchesBinding(
  event: KeyboardEvent,
  binding: ShortcutBinding,
): boolean {
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) return false;
  if (!!binding.alt !== event.altKey) return false;
  if (!!binding.meta !== event.metaKey) return false;
  if (!!binding.shift !== event.shiftKey) return false;
  return true;
}

export function formatBinding(
  binding: ShortcutBinding,
  isMac: boolean,
): string {
  const parts: string[] = [];

  if (binding.meta) {
    parts.push(isMac ? "\u2318" : "Ctrl");
  }
  if (binding.alt) {
    parts.push(isMac ? "\u2325" : "Alt");
  }
  if (binding.shift) {
    parts.push(isMac ? "\u21E7" : "Shift");
  }

  const keyDisplay = KEY_DISPLAY_MAP[binding.key] ?? binding.key.toUpperCase();
  parts.push(keyDisplay);

  return parts.join(isMac ? "" : "+");
}

const KEY_DISPLAY_MAP: Record<string, string> = {
  ArrowUp: "\u2191",
  ArrowDown: "\u2193",
  ArrowLeft: "\u2190",
  ArrowRight: "\u2192",
  Escape: "Esc",
  Enter: "\u21B5",
  Backspace: "\u232B",
  Delete: "\u2326",
  Tab: "\u21E5",
  " ": "Space",
};

export function resolveShortcuts(
  overrides: KeybindingOverride[],
): ShortcutDefinition[] {
  return DEFAULT_SHORTCUTS.map((def) => {
    const override = overrides.find((o) => o.id === def.id);
    if (!override) return { ...def };
    return {
      ...def,
      binding: override.binding ?? def.defaultBinding,
      enabled: override.enabled,
    };
  });
}

export const RESERVED_BINDINGS: ShortcutBinding[] = [
  { key: "r", meta: true },
  { key: "w", meta: true },
  { key: "t", meta: true },
  { key: "n", meta: true },
  { key: "q", meta: true },
  { key: "l", meta: true },
  { key: "a", meta: true },
  { key: "f", meta: true },
  { key: "p", meta: true },
];

export function isReservedBinding(binding: ShortcutBinding): boolean {
  return RESERVED_BINDINGS.some((r) => bindingsEqual(r, binding));
}

export function eventToBinding(event: KeyboardEvent): ShortcutBinding {
  return {
    key: event.key,
    ...(event.altKey && { alt: true }),
    ...(event.metaKey && { meta: true }),
    ...(event.shiftKey && { shift: true }),
  };
}

export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    !!a.alt === !!b.alt &&
    !!a.meta === !!b.meta &&
    !!a.shift === !!b.shift
  );
}

export interface ShortcutGroup {
  label: TranslationKey;
  ids: ShortcutAction[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "shortcutGroup.copy",
    ids: [
      ShortcutActions.COPY_ALL,
      ShortcutActions.COPY_ALL_RAW,
      ShortcutActions.COPY_SELECTION_RAW,
      ShortcutActions.COPY_SELECTION_LLM,
    ],
  },
  {
    label: "shortcutGroup.navigate",
    ids: [ShortcutActions.NAVIGATE_NEXT, ShortcutActions.NAVIGATE_PREVIOUS],
  },
  {
    label: "shortcutGroup.other",
    ids: [ShortcutActions.CLEAR_SELECTION],
  },
];
