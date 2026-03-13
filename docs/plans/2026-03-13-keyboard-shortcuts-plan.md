# Keyboard Shortcuts — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate scattered keyboard shortcut handling into a centralized registry with rebinding UI and server-side persistence.

**Architecture:** A shortcut registry defines all shortcuts as data. A single `useKeyboardShortcuts` hook replaces all scattered `keydown` listeners. Custom bindings are persisted via the existing settings API (`~/.readit/settings/`). The settings modal gets a keyboard shortcuts editor with rebinding and enable/disable.

**Tech Stack:** React 19, TypeScript, Vitest, Bun.serve(), Tailwind CSS v4

**Design doc:** `docs/plans/2026-03-13-keyboard-shortcuts-design.md`

---

### Task 1: Types — Add ShortcutBinding and KeybindingOverride

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add types to `src/types/index.ts`**

Append after the `DocumentSettings` interface (line 90):

```ts
// Keyboard shortcut binding
export interface ShortcutBinding {
  key: string; // KeyboardEvent.key value, e.g. "c", "ArrowUp"
  alt?: boolean;
  meta?: boolean; // ⌘ on Mac, Ctrl on Windows/Linux
  shift?: boolean;
}

// User override for a shortcut
export interface KeybindingOverride {
  id: string;
  binding?: ShortcutBinding; // undefined = use default
  enabled: boolean;
}
```

**Step 2: Extend `DocumentSettings` to include keybindings**

Change the `DocumentSettings` interface to:

```ts
export interface DocumentSettings {
  version: number;
  fontFamily: FontFamily;
  keybindings?: KeybindingOverride[];
}
```

**Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: PASS (no consumers of the new types yet)

**Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add ShortcutBinding and KeybindingOverride types"
```

---

### Task 2: Shortcut Registry — Definitions, Matcher, Display Formatter

**Files:**
- Create: `src/lib/shortcut-registry.ts`
- Create: `src/lib/shortcut-registry.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/shortcut-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  type ShortcutBinding,
  formatBinding,
  matchesBinding,
  resolveShortcuts,
  type KeybindingOverride,
  RESERVED_BINDINGS,
  isReservedBinding,
  ShortcutActions,
} from "./shortcut-registry";

describe("DEFAULT_SHORTCUTS", () => {
  it("defines 7 shortcuts", () => {
    expect(DEFAULT_SHORTCUTS).toHaveLength(7);
  });

  it("has unique IDs", () => {
    const ids = DEFAULT_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all enabled by default", () => {
    for (const shortcut of DEFAULT_SHORTCUTS) {
      expect(shortcut.enabled).toBe(true);
    }
  });
});

describe("matchesBinding", () => {
  it("matches exact key + modifiers", () => {
    const binding: ShortcutBinding = { key: "c", alt: true };
    const event = new KeyboardEvent("keydown", { key: "c", altKey: true });
    expect(matchesBinding(event, binding)).toBe(true);
  });

  it("rejects wrong key", () => {
    const binding: ShortcutBinding = { key: "c", alt: true };
    const event = new KeyboardEvent("keydown", { key: "v", altKey: true });
    expect(matchesBinding(event, binding)).toBe(false);
  });

  it("rejects extra modifiers", () => {
    const binding: ShortcutBinding = { key: "c", alt: true };
    const event = new KeyboardEvent("keydown", {
      key: "c",
      altKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, binding)).toBe(false);
  });

  it("matches binding with shift", () => {
    const binding: ShortcutBinding = { key: "c", alt: true, shift: true };
    const event = new KeyboardEvent("keydown", {
      key: "c",
      altKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, binding)).toBe(true);
  });

  it("matches meta key", () => {
    const binding: ShortcutBinding = { key: "c", meta: true };
    const event = new KeyboardEvent("keydown", { key: "c", metaKey: true });
    expect(matchesBinding(event, binding)).toBe(true);
  });

  it("matches key-only binding (no modifiers)", () => {
    const binding: ShortcutBinding = { key: "Escape" };
    const event = new KeyboardEvent("keydown", { key: "Escape" });
    expect(matchesBinding(event, binding)).toBe(true);
  });
});

describe("formatBinding", () => {
  it("formats Alt+C", () => {
    const binding: ShortcutBinding = { key: "c", alt: true };
    // macOS
    expect(formatBinding(binding, true)).toBe("Alt+C");
  });

  it("formats meta key as ⌘ on Mac", () => {
    const binding: ShortcutBinding = { key: "c", meta: true };
    expect(formatBinding(binding, true)).toBe("⌘+C");
  });

  it("formats meta key as Ctrl on non-Mac", () => {
    const binding: ShortcutBinding = { key: "c", meta: true };
    expect(formatBinding(binding, false)).toBe("Ctrl+C");
  });

  it("formats shift modifier", () => {
    const binding: ShortcutBinding = { key: "c", meta: true, shift: true };
    expect(formatBinding(binding, true)).toBe("⌘+Shift+C");
  });

  it("formats arrow keys with symbols", () => {
    const binding: ShortcutBinding = { key: "ArrowUp", alt: true };
    expect(formatBinding(binding, true)).toBe("Alt+↑");
  });

  it("formats Escape", () => {
    const binding: ShortcutBinding = { key: "Escape" };
    expect(formatBinding(binding, true)).toBe("Esc");
  });
});

describe("resolveShortcuts", () => {
  it("returns defaults when no overrides", () => {
    const resolved = resolveShortcuts([]);
    expect(resolved).toEqual(DEFAULT_SHORTCUTS);
  });

  it("applies enabled override", () => {
    const overrides: KeybindingOverride[] = [
      { id: ShortcutActions.COPY_ALL, enabled: false },
    ];
    const resolved = resolveShortcuts(overrides);
    const copyAll = resolved.find((s) => s.id === ShortcutActions.COPY_ALL);
    expect(copyAll?.enabled).toBe(false);
  });

  it("applies binding override", () => {
    const overrides: KeybindingOverride[] = [
      {
        id: ShortcutActions.COPY_ALL,
        enabled: true,
        binding: { key: "a", meta: true },
      },
    ];
    const resolved = resolveShortcuts(overrides);
    const copyAll = resolved.find((s) => s.id === ShortcutActions.COPY_ALL);
    expect(copyAll?.binding).toEqual({ key: "a", meta: true });
  });

  it("ignores unknown override IDs", () => {
    const overrides: KeybindingOverride[] = [
      { id: "unknown_action", enabled: false },
    ];
    const resolved = resolveShortcuts(overrides);
    expect(resolved).toEqual(DEFAULT_SHORTCUTS);
  });
});

describe("isReservedBinding", () => {
  it("detects ⌘+W as reserved", () => {
    expect(isReservedBinding({ key: "w", meta: true })).toBe(true);
  });

  it("allows Alt+C", () => {
    expect(isReservedBinding({ key: "c", alt: true })).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun run test src/lib/shortcut-registry.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `src/lib/shortcut-registry.ts`:

```ts
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
  if (event.key !== binding.key) return false;
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
export function formatBinding(binding: ShortcutBinding, isMac: boolean): string {
  const parts: string[] = [];

  if (binding.meta) parts.push(isMac ? "⌘" : "Ctrl");
  if (binding.alt) parts.push("Alt");
  if (binding.shift) parts.push("Shift");

  const keyDisplay =
    KEY_DISPLAY[binding.key] ?? binding.key.toUpperCase();
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
      reserved.key === binding.key &&
      (reserved.meta ?? false) === (binding.meta ?? false) &&
      (reserved.alt ?? false) === (binding.alt ?? false) &&
      (reserved.shift ?? false) === (binding.shift ?? false),
  );
}

/**
 * Convert a KeyboardEvent to a ShortcutBinding (for the capture UI).
 */
export function eventToBinding(event: KeyboardEvent): ShortcutBinding | undefined {
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
export function bindingsEqual(
  a: ShortcutBinding,
  b: ShortcutBinding,
): boolean {
  return (
    a.key === b.key &&
    (a.alt ?? false) === (b.alt ?? false) &&
    (a.meta ?? false) === (b.meta ?? false) &&
    (a.shift ?? false) === (b.shift ?? false)
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run test src/lib/shortcut-registry.test.ts`
Expected: PASS — all tests green

**Step 5: Commit**

```bash
git add src/lib/shortcut-registry.ts src/lib/shortcut-registry.test.ts
git commit -m "feat: add shortcut registry with definitions, matcher, and formatter"
```

---

### Task 3: useKeybindings Hook — State Management & Persistence

**Files:**
- Create: `src/hooks/useKeybindings.ts`

**Step 1: Write the hook**

Create `src/hooks/useKeybindings.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  type ShortcutDefinition,
  resolveShortcuts,
} from "../lib/shortcut-registry";
import type { KeybindingOverride, ShortcutBinding } from "../types";

interface UseKeybindingsResult {
  shortcuts: ShortcutDefinition[];
  updateBinding: (id: string, binding: ShortcutBinding) => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  isLoading: boolean;
}

export function useKeybindings(filePath: string | null): UseKeybindingsResult {
  const [overrides, setOverrides] = useState<KeybindingOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch keybindings from settings on mount
  useEffect(() => {
    if (!filePath) {
      setIsLoading(false);
      return;
    }

    const fetchKeybindings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const settings = await response.json();
          setOverrides(settings.keybindings ?? []);
        }
      } catch (err) {
        console.error("Failed to fetch keybindings:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKeybindings();
  }, [filePath]);

  const persistOverrides = useCallback(
    async (newOverrides: KeybindingOverride[]) => {
      try {
        const response = await fetch("/api/settings");
        if (!response.ok) return;

        const currentSettings = await response.json();
        const updated = { ...currentSettings, keybindings: newOverrides };

        const putResponse = await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated),
        });

        if (!putResponse.ok) {
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

  const toggleEnabled = useCallback(
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

  const resetToDefaults = useCallback(async () => {
    setOverrides([]);
    await persistOverrides([]);
    toast.success("Keyboard shortcuts reset to defaults");
  }, [persistOverrides]);

  const shortcuts = resolveShortcuts(overrides);

  return {
    shortcuts,
    updateBinding,
    toggleEnabled,
    resetToDefaults,
    isLoading,
  };
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/useKeybindings.ts
git commit -m "feat: add useKeybindings hook for shortcut state and persistence"
```

---

### Task 4: Server — Accept keybindings in Settings API

**Files:**
- Modify: `src/server/index.ts`

**Step 1: Update the `updateSettings` function**

In `src/server/index.ts`, change `updateSettings` (lines 399-421) to accept and persist `keybindings`:

Replace the existing `updateSettings` function:

```ts
async function updateSettings(
  ctx: RouteContext,
  req: Request,
): Promise<Response> {
  try {
    const body = await req.json();
    const { fontFamily, keybindings } = body;

    if (fontFamily !== undefined && !isValidFontFamily(fontFamily)) {
      return errorResponse("Invalid font family", 400);
    }

    // Read current settings and merge
    const current = await readSettingsFromFile(ctx.filePath);
    const settings: DocumentSettings = {
      ...current,
      ...(fontFamily !== undefined && { fontFamily }),
      ...(keybindings !== undefined && { keybindings }),
    };

    await writeSettingsToFile(ctx.filePath, settings);
    return json(settings);
  } catch (err) {
    console.error("Failed to save settings:", err);
    return errorResponse("Failed to save settings", 500);
  }
}
```

Also import `DocumentSettings` at the top if not already imported. Check existing import at line 19 — it imports `type DocumentSettings` already, so no change needed.

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: accept keybindings in settings API"
```

---

### Task 5: useKeyboardShortcuts Hook — Centralized Key Listener

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`

**Step 1: Write the hook**

Create `src/hooks/useKeyboardShortcuts.ts`:

```ts
import { useEffect, useRef } from "react";
import {
  type ShortcutAction,
  type ShortcutDefinition,
  matchesBinding,
} from "../lib/shortcut-registry";

type ActionMap = Partial<Record<ShortcutAction, () => void>>;

/**
 * Returns true if the event target is an input element where
 * keyboard shortcuts should be suppressed.
 */
function isInputFocused(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA") return true;
  if (target.isContentEditable) return true;

  return false;
}

/**
 * Single centralized keyboard shortcut listener.
 * Replaces all scattered useEffect keydown handlers.
 *
 * @param shortcuts - Resolved shortcut definitions (from useKeybindings)
 * @param actions - Map of shortcut ID to callback function
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutDefinition[],
  actions: ActionMap,
): void {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInputFocused(event)) return;

      for (const shortcut of shortcutsRef.current) {
        if (!shortcut.enabled) continue;

        if (matchesBinding(event, shortcut.binding)) {
          const action = actionsRef.current[shortcut.id];
          if (action) {
            event.preventDefault();
            action();
          }
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: add centralized useKeyboardShortcuts hook"
```

---

### Task 6: Wire Up in App.tsx — Connect Hook to Actions

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/hooks/useClipboard.ts`
- Modify: `src/hooks/useCommentNavigation.ts`

**Step 1: Remove old keyboard handlers from `useClipboard.ts`**

In `src/hooks/useClipboard.ts`, delete lines 72-103 (the refs and the useEffect keydown block). Also remove `useEffect` and `useRef` from the react import if no longer used. The hook should only export the action callbacks.

The updated hook becomes:

```ts
import { useCallback } from "react";
import { toast } from "sonner";
import { extractContext, formatForLLM } from "../lib/context";
import {
  exportCommentsAsJson,
  generatePrompt,
  generateRawText,
} from "../lib/export";
import { truncate } from "../lib/utils";
import type { Comment, Document, Selection } from "../types";

interface UseClipboardParams {
  comments: Comment[];
  document: Document | undefined;
  selection: Selection | undefined;
  clearSelection: () => void;
}

export function useClipboard({
  comments,
  document,
  selection,
  clearSelection,
}: UseClipboardParams) {
  const copyAll = useCallback(() => {
    if (!document) return;
    const prompt = generatePrompt(comments, document.fileName);
    navigator.clipboard.writeText(prompt);
    toast.success("Copied all comments");
  }, [comments, document]);

  const copyAllRaw = useCallback(() => {
    if (!document) return;
    const raw = generateRawText(comments);
    navigator.clipboard.writeText(raw);
    toast.success("Copied all comments as raw text");
  }, [comments, document]);

  const exportJson = useCallback(() => {
    if (!document) return;
    exportCommentsAsJson(comments, document);
  }, [comments, document]);

  const copySelectionRaw = useCallback(() => {
    if (!selection) return;
    navigator.clipboard.writeText(selection.text);
    toast.success(`Copied: "${truncate(selection.text)}"`);
    clearSelection();
  }, [selection, clearSelection]);

  const copySelectionForLLM = useCallback(() => {
    if (!selection || !document) return;
    const context = extractContext({
      content: document.content,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
    });
    const formatted = formatForLLM({
      context,
      fileName: document.fileName,
    });
    navigator.clipboard.writeText(formatted);
    toast.success(`Copied for LLM: "${truncate(selection.text)}"`);
    clearSelection();
  }, [selection, document, clearSelection]);

  return {
    copyAll,
    copyAllRaw,
    exportJson,
    copySelectionRaw,
    copySelectionForLLM,
  };
}
```

**Step 2: Remove old keyboard handlers from `useCommentNavigation.ts`**

In `src/hooks/useCommentNavigation.ts`, delete lines 119-136 (the keyboard navigation useEffect). Keep the `useEffect` import since it's still used for cleanup on line 31. Remove the `sortedComments.length` dependency from nowhere since the removed effect was the only consumer.

The file should look the same but without the `// Keyboard navigation: Alt+↑/↓` useEffect block.

**Step 3: Wire up `useKeyboardShortcuts` in `App.tsx`**

Add imports at the top of `src/App.tsx`:

```ts
import { useKeybindings } from "./hooks/useKeybindings";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ShortcutActions } from "./lib/shortcut-registry";
```

In `AppContent`, after the existing `useClipboard` call (~line 71), add:

```ts
const { document: doc } = useDocument();
```

Wait — `document` is already destructured. We need access to `filePath` for `useKeybindings`. The `LayoutProvider` wraps `AppContent` and already has `filePath`. We can either:
- Pass it as a prop, or
- Access it from `CommentContext` (which already has it)

Looking at the code, `CommentProvider` receives `filePath`. Let's get it from the existing context. Check `CommentContext` — it has `filePath` available on the provider props but may not expose it. Let's use the `document.filePath` that's already available from `useDocument()`.

In `AppContent`, after `useClipboard` (line 71), add:

```ts
const { shortcuts } = useKeybindings(document?.filePath ?? null);

const { navigatePrevious, navigateNext } = use(CommentContext)!;

useKeyboardShortcuts(shortcuts, {
  [ShortcutActions.COPY_ALL]: copyAll,
  [ShortcutActions.COPY_ALL_RAW]: copyAllRaw,
  [ShortcutActions.NAVIGATE_NEXT]: navigateNext,
  [ShortcutActions.NAVIGATE_PREVIOUS]: navigatePrevious,
  [ShortcutActions.COPY_SELECTION_RAW]: copySelectionRaw,
  [ShortcutActions.COPY_SELECTION_LLM]: copySelectionForLLM,
  [ShortcutActions.CLEAR_SELECTION]: clearSelection,
});
```

Note: `navigatePrevious` and `navigateNext` come from `CommentContext` — check if they're already destructured. Looking at line 37-46, the destructured values from `CommentContext` do NOT include `navigatePrevious` / `navigateNext`. But `CommentNav` uses them via its own `use(CommentContext)`. We need to add them to the destructure at line 37.

Update the destructure at line 37:

```ts
const {
  comments,
  sortedComments,
  addComment,
  reanchorComment,
  reanchorTarget,
  cancelReanchor,
  hoveredCommentId,
  setHoveredCommentId,
  navigatePrevious,
  navigateNext,
} = use(CommentContext)!;
```

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Run dev server and manually test**

Run: `bun dev`

Test:
- `Alt+↓` / `Alt+↑` still navigate comments
- `Alt+C` copies all comments (new!)
- `Alt+Shift+C` copies all raw (new!)
- `⌘+C` / `⌘+Shift+C` copy selection when text is selected
- `Escape` clears selection

**Step 6: Commit**

```bash
git add src/App.tsx src/hooks/useClipboard.ts src/hooks/useCommentNavigation.ts
git commit -m "feat: wire centralized keyboard shortcuts, remove scattered handlers"
```

---

### Task 7: ShortcutCapture Component

**Files:**
- Create: `src/components/ShortcutCapture.tsx`

**Step 1: Write the component**

Create `src/components/ShortcutCapture.tsx`:

```tsx
import { useCallback, useEffect, useRef } from "react";
import {
  type ShortcutBinding,
  eventToBinding,
  formatBinding,
  isReservedBinding,
} from "../lib/shortcut-registry";

interface ShortcutCaptureProps {
  currentBinding: ShortcutBinding;
  onCapture: (binding: ShortcutBinding) => void;
  onCancel: () => void;
  isMac: boolean;
}

export function ShortcutCapture({
  currentBinding,
  onCapture,
  onCancel,
  isMac,
}: ShortcutCaptureProps) {
  const capturedRef = useRef<ShortcutBinding | undefined>();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        onCancel();
        return;
      }

      const binding = eventToBinding(e);
      if (!binding) return;

      if (isReservedBinding(binding)) {
        return; // Silently ignore reserved bindings
      }

      capturedRef.current = binding;
      onCapture(binding);
    },
    [onCapture, onCancel],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [handleKeyDown]);

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium animate-pulse">
      Press keys...
    </span>
  );
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/ShortcutCapture.tsx
git commit -m "feat: add ShortcutCapture component for key rebinding"
```

---

### Task 8: ShortcutList Component

**Files:**
- Create: `src/components/ShortcutList.tsx`

**Step 1: Write the component**

Create `src/components/ShortcutList.tsx`:

```tsx
import { useCallback, useMemo, useState } from "react";
import {
  type ShortcutBinding,
  type ShortcutDefinition,
  bindingsEqual,
  formatBinding,
} from "../lib/shortcut-registry";
import { ShortcutCapture } from "./ShortcutCapture";

interface ShortcutListProps {
  shortcuts: ShortcutDefinition[];
  onUpdateBinding: (id: string, binding: ShortcutBinding) => Promise<void>;
  onToggleEnabled: (id: string) => Promise<void>;
  onResetToDefaults: () => Promise<void>;
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function ShortcutList({
  shortcuts,
  onUpdateBinding,
  onToggleEnabled,
  onResetToDefaults,
}: ShortcutListProps) {
  const [capturingId, setCapturingId] = useState<string | undefined>();

  const hasOverrides = useMemo(
    () =>
      shortcuts.some(
        (s) => !s.enabled || !bindingsEqual(s.binding, s.defaultBinding),
      ),
    [shortcuts],
  );

  const handleCapture = useCallback(
    async (id: string, binding: ShortcutBinding) => {
      // Check for conflicts
      const conflict = shortcuts.find(
        (s) => s.id !== id && s.enabled && bindingsEqual(s.binding, binding),
      );

      if (conflict) {
        // Swap bindings
        const currentShortcut = shortcuts.find((s) => s.id === id);
        if (currentShortcut) {
          await onUpdateBinding(conflict.id, currentShortcut.binding);
        }
      }

      await onUpdateBinding(id, binding);
      setCapturingId(undefined);
    },
    [shortcuts, onUpdateBinding],
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.id}
            className="flex items-center gap-3 py-1.5 group"
          >
            <input
              type="checkbox"
              checked={shortcut.enabled}
              onChange={() => onToggleEnabled(shortcut.id)}
              className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-600 focus:ring-zinc-500 cursor-pointer"
            />

            <span className="flex-1 text-sm text-zinc-700 truncate">
              {shortcut.label}
            </span>

            <div className="flex items-center gap-1.5 min-w-[100px] justify-end">
              {capturingId === shortcut.id ? (
                <ShortcutCapture
                  currentBinding={shortcut.binding}
                  onCapture={(binding) => handleCapture(shortcut.id, binding)}
                  onCancel={() => setCapturingId(undefined)}
                  isMac={isMac}
                />
              ) : (
                <>
                  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-600 text-xs font-mono">
                    {formatBinding(shortcut.binding, isMac)}
                  </kbd>
                  <button
                    type="button"
                    onClick={() => setCapturingId(shortcut.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-zinc-400 hover:text-zinc-600"
                    title="Edit shortcut"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {hasOverrides && (
        <button
          type="button"
          onClick={onResetToDefaults}
          className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          Reset to defaults
        </button>
      )}
    </div>
  );
}
```

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/ShortcutList.tsx
git commit -m "feat: add ShortcutList component for shortcut editor UI"
```

---

### Task 9: Settings Modal — Add Keyboard Shortcuts Section

**Files:**
- Modify: `src/components/SettingsModal.tsx`
- Modify: `src/contexts/LayoutContext.tsx`

**Step 1: Expose keybindings from LayoutContext**

The `LayoutProvider` already uses `useFontPreference`. We need to also call `useKeybindings` and expose its values. Update `src/contexts/LayoutContext.tsx`:

```ts
import { createContext, type ReactNode, use, useMemo } from "react";
import { useFontPreference } from "../hooks/useFontPreference";
import { useKeybindings } from "../hooks/useKeybindings";
import { useLayoutMode } from "../hooks/useLayoutMode";
import type { ShortcutDefinition } from "../lib/shortcut-registry";
import type { FontFamily, ShortcutBinding } from "../types";

interface LayoutContextValue {
  isFullscreen: boolean;
  toggleLayoutMode: () => void;
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => Promise<void>;
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
  filePath: string;
  children: ReactNode;
}

export function LayoutProvider({ filePath, children }: LayoutProviderProps) {
  const { isFullscreen, toggleLayoutMode } = useLayoutMode();
  const { fontFamily, setFontFamily } = useFontPreference(filePath);
  const {
    shortcuts,
    updateBinding,
    toggleEnabled: toggleShortcutEnabled,
    resetToDefaults: resetShortcutsToDefaults,
  } = useKeybindings(filePath);

  const value = useMemo<LayoutContextValue>(
    () => ({
      isFullscreen,
      toggleLayoutMode,
      fontFamily,
      setFontFamily,
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
      shortcuts,
      updateBinding,
      toggleShortcutEnabled,
      resetShortcutsToDefaults,
    ],
  );

  return <LayoutContext value={value}>{children}</LayoutContext>;
}
```

**Step 2: Update SettingsModal to include shortcuts**

Replace `src/components/SettingsModal.tsx`:

```tsx
import { useLayoutContext } from "../contexts/LayoutContext";
import { cn } from "../lib/utils";
import { FontFamilies } from "../types";
import { ShortcutList } from "./ShortcutList";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/Dialog";
import { Text, textVariants } from "./ui/Text";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const {
    fontFamily,
    setFontFamily,
    shortcuts,
    updateBinding,
    toggleShortcutEnabled,
    resetShortcutsToDefaults,
  } = useLayoutContext();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Font</h3>
            </Text>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="fontFamily"
                  value={FontFamilies.SERIF}
                  checked={fontFamily === FontFamilies.SERIF}
                  onChange={() => setFontFamily(FontFamilies.SERIF)}
                  className="w-4 h-4 text-zinc-600 border-zinc-300 focus:ring-zinc-500"
                />
                <Text variant="body" asChild>
                  <span>Serif</span>
                </Text>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="fontFamily"
                  value={FontFamilies.SANS_SERIF}
                  checked={fontFamily === FontFamilies.SANS_SERIF}
                  onChange={() => setFontFamily(FontFamilies.SANS_SERIF)}
                  className="w-4 h-4 text-zinc-600 border-zinc-300 focus:ring-zinc-500"
                />
                <Text variant="body" asChild>
                  <span>Sans-serif</span>
                </Text>
              </label>
            </div>
          </div>

          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Preview</h3>
            </Text>
            <div
              className={cn(
                textVariants({ variant: "body" }),
                "p-3 rounded-md border border-zinc-100 leading-relaxed",
                fontFamily === FontFamilies.SERIF ? "font-serif" : "font-sans",
              )}
            >
              The quick brown fox jumps over the lazy dog. 1234567890
            </div>
          </div>

          <div>
            <Text variant="overline" asChild>
              <h3 className="mb-3">Keyboard Shortcuts</h3>
            </Text>
            <ShortcutList
              shortcuts={shortcuts}
              onUpdateBinding={updateBinding}
              onToggleEnabled={toggleShortcutEnabled}
              onResetToDefaults={resetShortcutsToDefaults}
            />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Update App.tsx to use shortcuts from LayoutContext**

In `src/App.tsx`, update the `useKeyboardShortcuts` wiring to get shortcuts from `LayoutContext` instead of calling `useKeybindings` directly (since it's now in the provider):

```ts
const { shortcuts } = use(LayoutContext)!;
```

Remove the `useKeybindings` import and direct call from `AppContent`. Keep everything else the same.

**Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 5: Run dev server and test the full flow**

Run: `bun dev`

Test:
- Open Settings modal → Keyboard Shortcuts section visible
- Toggle a shortcut off → verify it no longer fires
- Click edit pencil → "Press keys..." appears → press new combo → binding updates
- Verify conflict swap works (rebind to an existing binding)
- Click "Reset to defaults" → all bindings reset
- Reload page → customizations persist

**Step 6: Commit**

```bash
git add src/contexts/LayoutContext.tsx src/components/SettingsModal.tsx src/App.tsx
git commit -m "feat: add keyboard shortcuts editor to settings modal"
```

---

### Task 10: Update Tooltip Hints Across Components

**Files:**
- Modify: `src/components/comments/CommentNav.tsx`
- Modify: `src/components/MarginNote.tsx`

**Step 1: Update CommentNav button titles**

The `CommentNav.tsx` component shows hardcoded shortcut hints in button titles (e.g., `title="Next comment (Alt+↓)"`). These should stay as-is for now since they show defaults. If bindings are customized, the titles will be slightly inaccurate, but this is acceptable for v1. A future improvement could make these dynamic.

No code changes needed for this step — just a note for future work.

**Step 2: Update MarginNote copy hints**

In `src/components/MarginNote.tsx`, the action links show hardcoded shortcut hints:
```tsx
<ActionLink onClick={handleCopy} title="Copy raw text (⌘C)">
```

Same as above — acceptable for v1 with hardcoded defaults.

No code changes needed.

**Step 3: Commit**

Skip — no changes.

---

### Task 11: Final Verification

**Step 1: Run full test suite**

Run: `bun run test`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: PASS

**Step 3: Run lint**

Run: `bun run check`
Expected: PASS (fix any issues with `bun run check:fix`)

**Step 4: Manual smoke test**

Run: `bun dev` and open a markdown file.

Verify all shortcuts:
- `Alt+C` → copies all comments (AI format)
- `Alt+Shift+C` → copies all comments (raw)
- `Alt+↓` → next comment
- `Alt+↑` → previous comment
- Select text → `⌘+C` copies selection
- Select text → `⌘+Shift+C` copies for LLM
- `Escape` → clears selection
- Settings → toggle/rebind/reset all work
- Reload → customizations persist

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: lint and format fixes for keyboard shortcuts feature"
```

(Only if there are lint/format changes to commit)
