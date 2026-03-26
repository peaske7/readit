# Surgical Pruning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggressively prune readit's frontend to remove ~4,000+ lines of unnecessary code, flatten state management layers, and eliminate heavy unused features — making the tool feel absurdly fast.

**Architecture:** Delete-first approach. Remove entire feature systems (minimap, layout modes, keyboard shortcut customization, editor scheme), flatten the triple-layered state management (Zustand store + 4 Contexts + 18 hooks) into a simpler structure, and cut heavyweight dependencies. The server and core libs (anchor, comment-storage, export) remain untouched — they're solid.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS v4, Zustand, Bun

---

## File Map

### Files to DELETE entirely

| File | Lines | Reason |
|------|-------|--------|
| `src/hooks/useLayoutMode.ts` | 44 | Fullscreen/centered toggle — removing layout modes |
| `src/hooks/useKeybindings.ts` | 108 | Shortcut customization system |
| `src/hooks/useKeyboardShortcuts.ts` | 63 | Shortcut listener |
| `src/hooks/useEditorScheme.ts` | 51 | "Open in VSCode" feature |
| `src/hooks/useScrollMetrics.ts` | 50 | Only used by minimap |
| `src/components/FloatingTOC.tsx` | 61 | Only used in fullscreen mode |
| `src/components/ShortcutCapture.tsx` | ~100 | Shortcut rebinding UI |
| `src/components/ShortcutList.tsx` | ~100 | Shortcut list UI |
| `src/components/comments/CommentMinimap.tsx` | 71 | Minimap |
| `src/contexts/LayoutContext.tsx` | 89 | Replaced by simpler SettingsContext |
| `src/lib/shortcut-registry.ts` | 210 | Entire shortcut system |
| `src/lib/shortcut-registry.test.ts` | ~100 | Tests for deleted code |
| `src/lib/editor-links.ts` | 60 | Editor URI builder |

**Estimated deletion: ~1,100+ lines from files alone**

### Files to MODIFY (simplify)

| File | Change |
|------|--------|
| `src/types/index.ts` | Remove `LayoutMode`, `ShortcutBinding`, `KeybindingOverride`, `EditorScheme` types |
| `src/App.tsx` | Remove minimap, FloatingTOC, isFullscreen branching, keyboard shortcuts |
| `src/components/ActionsMenu.tsx` | Remove fullscreen toggle, remove editor scheme, simplify |
| `src/components/Header.tsx` | Remove isFullscreen conditional styling |
| `src/components/SettingsModal.tsx` | Remove shortcut list, remove editor scheme dropdown |
| `src/components/comments/CommentInput.tsx` | Remove LayoutContext import, get font simpler way |
| `src/components/DocumentViewer/DocumentViewer.tsx` | Remove editor scheme references |
| `src/server/index.ts` | Remove keybindings/editorScheme from settings handling |
| `src/store/index.ts` | Minor cleanup if any store fields become orphaned |

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/contexts/SettingsContext.tsx` | Lightweight replacement for LayoutContext — only font + theme |

---

## Prerequisites

**IMPORTANT:** The working tree has unstaged modifications. Before starting, create a new branch from current state:

```bash
git checkout -b refactor/surgical-pruning
git add -A && git commit -m "checkpoint: save WIP before pruning"
```

---

### Task 1: Delete standalone feature files

These files have no downstream dependents other than the files we'll modify in later tasks. Safe to delete first.

**Files:**
- Delete: `src/hooks/useLayoutMode.ts`
- Delete: `src/hooks/useKeybindings.ts`
- Delete: `src/hooks/useKeyboardShortcuts.ts`
- Delete: `src/hooks/useEditorScheme.ts`
- Delete: `src/hooks/useScrollMetrics.ts`
- Delete: `src/components/FloatingTOC.tsx`
- Delete: `src/components/ShortcutCapture.tsx`
- Delete: `src/components/ShortcutList.tsx`
- Delete: `src/components/comments/CommentMinimap.tsx`
- Delete: `src/lib/shortcut-registry.ts`
- Delete: `src/lib/shortcut-registry.test.ts`
- Delete: `src/lib/editor-links.ts`

- [ ] **Step 1: Delete all standalone files**

```bash
rm src/hooks/useLayoutMode.ts \
   src/hooks/useKeybindings.ts \
   src/hooks/useKeyboardShortcuts.ts \
   src/hooks/useEditorScheme.ts \
   src/hooks/useScrollMetrics.ts \
   src/components/FloatingTOC.tsx \
   src/components/ShortcutCapture.tsx \
   src/components/ShortcutList.tsx \
   src/components/comments/CommentMinimap.tsx \
   src/lib/shortcut-registry.ts \
   src/lib/shortcut-registry.test.ts \
   src/lib/editor-links.ts
```

- [ ] **Step 2: Verify deletion didn't break anything unexpected**

```bash
# This WILL fail with import errors — that's expected. We just want to see which files reference deleted code.
bun run typecheck 2>&1 | grep "Cannot find module" | sort -u
```

Expected: errors from `App.tsx`, `LayoutContext.tsx`, `SettingsModal.tsx`, `ActionsMenu.tsx`, `CommentInput.tsx`, `DocumentViewer.tsx` referencing deleted modules. These are fixed in subsequent tasks.

- [ ] **Step 3: Commit deletions**

```bash
git add -A
git commit -m "chore: delete minimap, layout modes, shortcuts, editor scheme files"
```

---

### Task 2: Strip types and delete LayoutContext

**Files:**
- Modify: `src/types/index.ts`
- Delete: `src/contexts/LayoutContext.tsx`

- [ ] **Step 1: Simplify types/index.ts**

Remove these blocks from `src/types/index.ts`:

- `EditorSchemes` const + `EditorScheme` type (lines 71-78)
- `LayoutModes` const + `LayoutMode` type (lines 97-103)
- `ShortcutBinding` interface (lines 106-111)
- `KeybindingOverride` interface (lines 114-118)
- Remove `editorScheme` and `keybindings` fields from `DocumentSettings` interface (lines 124-125)

The resulting `DocumentSettings` should be:

```typescript
export interface DocumentSettings {
  version: number;
  fontFamily: FontFamily;
  onboarded?: boolean;
}
```

- [ ] **Step 2: Delete LayoutContext**

```bash
rm src/contexts/LayoutContext.tsx
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove LayoutMode, EditorScheme, ShortcutBinding types and LayoutContext"
```

---

### Task 3: Create lightweight SettingsContext

Replaces LayoutContext with only what's needed: font preference + theme preference.

**Files:**
- Create: `src/contexts/SettingsContext.tsx`

- [ ] **Step 1: Create SettingsContext**

```tsx
// src/contexts/SettingsContext.tsx
import { createContext, type ReactNode, use, useMemo } from "react";
import { useFontPreference } from "../hooks/useFontPreference";
import { useThemePreference } from "../hooks/useThemePreference";
import type { FontFamily, ThemeMode } from "../types";

interface SettingsContextValue {
  fontFamily: FontFamily;
  setFontFamily: (font: FontFamily) => Promise<void>;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
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
  const { fontFamily, setFontFamily } = useFontPreference();
  const { themeMode, setThemeMode } = useThemePreference();

  const value = useMemo<SettingsContextValue>(
    () => ({ fontFamily, setFontFamily, themeMode, setThemeMode }),
    [fontFamily, setFontFamily, themeMode, setThemeMode],
  );

  return <SettingsContext value={value}>{children}</SettingsContext>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/SettingsContext.tsx
git commit -m "feat: add lightweight SettingsContext replacing LayoutContext"
```

---

### Task 4: Rewire App.tsx

The biggest consumer of deleted features. Remove minimap, FloatingTOC, keyboard shortcuts, isFullscreen branching.

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update imports**

Remove these imports:
- `CommentMinimap`
- `FloatingTOC`
- `useKeyboardShortcuts`
- `useScrollMetrics`
- `ShortcutActions`
- `LayoutContext`, `LayoutProvider` from contexts

Add:
- `SettingsProvider` from `./contexts/SettingsContext`

- [ ] **Step 2: Simplify AppContent**

Remove from `AppContent`:
- `const { shortcuts, isFullscreen } = use(LayoutContext)!;` — delete entirely
- `useKeyboardShortcuts(...)` call — delete entirely
- `const scrollMetrics = useScrollMetrics();` — delete entirely
- The `{isFullscreen && <FloatingTOC ... />}` block — delete
- The `<CommentMinimap ... />` component — delete
- The `!isFullscreen` conditional on `max-w-7xl mx-auto` — always apply max-width (centered layout)
- The `!isFullscreen &&` guard on the TOC sidebar — always show TOC sidebar

The main layout div should become:

```tsx
<div className="flex-1 flex gap-4 w-full max-w-7xl mx-auto">
  {headings.length > 0 && (
    <aside className="w-48 flex-shrink-0 py-6 pl-6 hidden xl:block">
      <div className="sticky top-64 max-h-[calc(100vh-17rem)] overflow-y-auto">
        <TableOfContents
          headings={headings}
          activeId={activeHeadingId}
          onHeadingClick={scrollToHeading}
        />
      </div>
    </aside>
  )}
  {/* ... document + margin notes unchanged ... */}
</div>
```

- [ ] **Step 3: Replace LayoutProvider with SettingsProvider in App**

In the `App` component's return, change:

```tsx
// Before
<LayoutProvider>
  <PositionEngineProvider>
    <CommentProvider ...>
      <AppContent ... />
    </CommentProvider>
  </PositionEngineProvider>
</LayoutProvider>

// After
<SettingsProvider>
  <PositionEngineProvider>
    <CommentProvider ...>
      <AppContent ... />
    </CommentProvider>
  </PositionEngineProvider>
</SettingsProvider>
```

- [ ] **Step 4: Verify typecheck compiles (may still have errors in other files)**

```bash
bun run typecheck 2>&1 | head -30
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: remove minimap, FloatingTOC, shortcuts from App"
```

---

### Task 5: Simplify ActionsMenu

Remove fullscreen toggle and editor scheme. Keep: reload, copy all, copy raw, export JSON, view raw, settings.

**Files:**
- Modify: `src/components/ActionsMenu.tsx`

- [ ] **Step 1: Update ActionsMenu**

Remove:
- `useLayoutContext` import → replace with `useSettings` from `../contexts/SettingsContext` (only if needed — check if anything from it is still used)
- `Maximize2`, `Minimize2` icon imports
- `const { isFullscreen, toggleLayoutMode } = useLayoutContext();` line
- The fullscreen toggle `<DropdownMenuItem>` (the one with Maximize2/Minimize2)

If ActionsMenu no longer needs `useSettings` at all (it likely doesn't — settings modal handles its own context), remove the context import entirely.

- [ ] **Step 2: Commit**

```bash
git add src/components/ActionsMenu.tsx
git commit -m "refactor: remove fullscreen toggle from ActionsMenu"
```

---

### Task 6: Simplify Header

**Files:**
- Modify: `src/components/Header.tsx`

- [ ] **Step 1: Update Header**

Remove:
- `useLayoutContext` import
- `const { isFullscreen } = useLayoutContext();` line
- The `!isFullscreen &&` conditional on `max-w-7xl mx-auto` — always apply it

The header div className becomes:

```tsx
<div className="px-6 py-3 flex items-center justify-between max-w-7xl mx-auto">
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Header.tsx
git commit -m "refactor: remove fullscreen conditional from Header"
```

---

### Task 7: Simplify SettingsModal

Remove shortcut list and editor scheme sections. Keep: theme, font, language.

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Update imports**

Remove:
- `ExternalLink` from lucide-react
- `useLayoutContext` import → replace with `useSettings` from `../contexts/SettingsContext`
- `ShortcutList` import
- `EditorScheme`, `EditorSchemes` from types

- [ ] **Step 2: Simplify the component body**

Change the destructuring from:

```tsx
const {
  fontFamily, setFontFamily,
  editorScheme, setEditorScheme,
  themeMode, setThemeMode,
  shortcuts, updateBinding, toggleShortcutEnabled, resetShortcutsToDefaults,
} = useLayoutContext();
```

To:

```tsx
const { fontFamily, setFontFamily, themeMode, setThemeMode } = useSettings();
```

Remove:
- `editorOptions` array
- `activeEditor` variable
- The entire "Editor" `<div>` section (lines ~261-290)
- The entire "Keyboard Shortcuts" `<div>` section (lines ~292-305)

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "refactor: strip editor scheme and shortcuts from SettingsModal"
```

---

### Task 8: Simplify CommentInput

Remove LayoutContext dependency for font class.

**Files:**
- Modify: `src/components/comments/CommentInput.tsx`

- [ ] **Step 1: Update CommentInput**

Replace:

```tsx
import { LayoutContext } from "../../contexts/LayoutContext";
// ...
const layout = use(LayoutContext);
const fontClass = layout
  ? layout.fontFamily === FontFamilies.SANS_SERIF
    ? "font-sans"
    : "font-serif"
  : undefined;
```

With:

```tsx
import { SettingsContext } from "../../contexts/SettingsContext";
// ...
const settings = use(SettingsContext);
const fontClass = settings
  ? settings.fontFamily === FontFamilies.SANS_SERIF
    ? "font-sans"
    : "font-serif"
  : undefined;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/comments/CommentInput.tsx
git commit -m "refactor: switch CommentInput from LayoutContext to SettingsContext"
```

---

### Task 9: Clean up DocumentViewer editor scheme references

**Files:**
- Modify: `src/components/DocumentViewer/DocumentViewer.tsx`
- Check: `src/components/DocumentViewer/InlineCode.tsx`

- [ ] **Step 1: Find and remove editor scheme usage**

These files import `editorScheme` or `editor-links`. Remove:
- Any import of `useLayoutContext` or `LayoutContext` for `editorScheme`
- Any import from `../lib/editor-links`
- Any `buildEditorUri` / `parseFilePath` calls
- Replace editor-linked code elements with plain `<code>` elements (no click-to-open behavior)

If `DocumentViewer.tsx` uses `useLayoutContext` only for `editorScheme`, remove the import entirely. If it also uses `fontFamily`, switch to `useSettings`.

- [ ] **Step 2: Commit**

```bash
git add src/components/DocumentViewer/
git commit -m "refactor: remove editor scheme links from DocumentViewer"
```

---

### Task 10: Simplify server settings

**Files:**
- Modify: `src/server/index.ts`

- [ ] **Step 1: Clean up settings handling**

In `src/server/index.ts`:

Remove from imports:
- `EditorSchemes`, `type EditorScheme` from types

Remove:
- `isValidEditorScheme` function
- `editorScheme` handling in `updateSettingsRoute` (the `if (editorScheme !== undefined ...)` block and the spread)
- `keybindings` handling in `updateSettingsRoute` (the spread)

The `updateSettingsRoute` should simplify to only handling `fontFamily`:

```typescript
async function updateSettingsRoute(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { fontFamily } = body;

    if (fontFamily !== undefined && !isValidFontFamily(fontFamily)) {
      return errorResponse("Invalid font family", 400);
    }

    const current = await readSettings();
    const settings: DocumentSettings = {
      ...current,
      ...(fontFamily !== undefined && { fontFamily }),
    };

    await writeSettings(settings);
    return json(settings);
  } catch (err) {
    console.error("Failed to save settings:", err);
    return errorResponse("Failed to save settings", 500);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/index.ts
git commit -m "refactor: simplify server settings to font only"
```

---

### Task 11: Clean up barrel exports and unused hook re-exports

**Files:**
- Check/Modify: `src/hooks/index.ts` (if it exists and re-exports deleted hooks)
- Check/Modify: `src/components/index.ts` (if it exists and re-exports deleted components)

- [ ] **Step 1: Find and fix barrel exports**

```bash
# Check for re-exports of deleted modules
grep -r "useLayoutMode\|useKeybindings\|useKeyboardShortcuts\|useEditorScheme\|useScrollMetrics\|ShortcutCapture\|ShortcutList\|FloatingTOC\|CommentMinimap\|shortcut-registry\|editor-links\|LayoutContext\|useLayoutContext" src/ --include="*.ts" --include="*.tsx" -l
```

Remove any re-exports of deleted modules from barrel files.

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: clean up barrel exports for deleted modules"
```

---

### Task 12: Full verification

- [ ] **Step 1: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS with zero errors.

- [ ] **Step 2: Run tests**

```bash
bun run test
```

Expected: All remaining tests pass. `shortcut-registry.test.ts` was deleted — that's expected. Other test files should be unaffected.

- [ ] **Step 3: Run lint**

```bash
bun run check
```

Expected: No new lint errors. Fix any issues.

- [ ] **Step 4: Build**

```bash
bun run build
```

Expected: Successful production build.

- [ ] **Step 5: Manual smoke test**

```bash
bun dev -- test-file.md
```

Verify in browser:
- Document renders correctly
- Can select text and add comments
- Margin notes appear
- TOC sidebar shows (always, no fullscreen toggle)
- Settings modal opens with theme, font, language (no shortcuts, no editor scheme)
- Actions menu has no fullscreen toggle
- No minimap on right edge
- Copy All works
- No console errors

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve any remaining pruning issues"
```

---

### Task 13: Replace Radix Dialog with native `<dialog>`

Remove `@radix-ui/react-dialog` (and the 156-line wrapper) in favor of the HTML5 `<dialog>` element, which provides built-in backdrop, focus trap, and `Escape` to close.

**Files:**
- Rewrite: `src/components/ui/Dialog.tsx`

- [ ] **Step 1: Rewrite Dialog.tsx with native `<dialog>`**

```tsx
// src/components/ui/Dialog.tsx
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleClose = () => onOpenChange(false);
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onOpenChange]);

  // Close on backdrop click
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onOpenChange(false);
  };

  return (
    <dialog
      ref={ref}
      onClick={handleClick}
      className="backdrop:bg-black/20 dark:backdrop:bg-black/40 backdrop:backdrop-blur-sm bg-transparent p-0 m-auto max-w-none"
    >
      {open ? children : null}
    </dialog>
  );
}

function DialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm shadow-lg border border-zinc-200/40 dark:border-zinc-700/40 rounded-xl flex flex-col",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DialogHeader({
  className,
  children,
  onClose,
}: {
  className?: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between pl-4 pr-3 py-3 border-b border-zinc-100 dark:border-zinc-800",
        className,
      )}
    >
      {children}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="size-7 inline-flex items-center justify-center rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      className={cn(
        "text-sm font-medium text-zinc-900 dark:text-zinc-100",
        className,
      )}
    >
      {children}
    </h2>
  );
}

function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex-1 overflow-auto p-4", className)}>{children}</div>
  );
}

export { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle };
```

- [ ] **Step 2: Update SettingsModal and RawModal to use new Dialog API**

The new Dialog no longer has a built-in close button inside DialogContent. Instead, pass `onClose` to `DialogHeader`:

```tsx
// In SettingsModal.tsx / RawModal.tsx — adjust DialogHeader usage:
<Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
  <DialogContent className="max-w-md">
    <DialogHeader onClose={onClose}>
      <DialogTitle>{t("settings.title")}</DialogTitle>
    </DialogHeader>
    <DialogBody>...</DialogBody>
  </DialogContent>
</Dialog>
```

Remove any imports of `DialogTrigger`, `DialogClose`, `DialogPortal`, `DialogOverlay`, `DialogDescription` — they no longer exist.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Dialog.tsx src/components/SettingsModal.tsx src/components/RawModal.tsx
git commit -m "refactor: replace Radix Dialog with native <dialog> element"
```

---

### Task 14: Replace Radix DropdownMenu with lightweight custom dropdown

Replace `@radix-ui/react-dropdown-menu` with a simple custom dropdown using the existing `useClickOutside` hook.

**Files:**
- Rewrite: `src/components/ui/DropdownMenu.tsx`

- [ ] **Step 1: Rewrite DropdownMenu.tsx**

```tsx
// src/components/ui/DropdownMenu.tsx
import { createContext, use, useCallback, useRef, useState } from "react";
import { useClickOutside } from "../../hooks/useClickOutside";
import { cn } from "../../lib/utils";

interface DropdownState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownContext = createContext<DropdownState>({ open: false, setOpen: () => {} });

function DropdownMenu({
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      if (!isControlled) setInternalOpen(v);
      onOpenChange?.(v);
    },
    [isControlled, onOpenChange],
  );

  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <DropdownContext value={{ open, setOpen }}>
      <div ref={ref} className="relative inline-block">
        {children}
      </div>
    </DropdownContext>
  );
}

function DropdownMenuTrigger({
  asChild,
  children,
  ...props
}: {
  asChild?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen } = use(DropdownContext);

  if (asChild && children && typeof children === "object" && "props" in children) {
    const child = children as React.ReactElement<Record<string, unknown>>;
    return (
      <child.type
        {...child.props}
        onClick={(e: React.MouseEvent) => {
          setOpen(!open);
          if (typeof child.props.onClick === "function") child.props.onClick(e);
        }}
      />
    );
  }

  return (
    <button type="button" onClick={() => setOpen(!open)} {...props}>
      {children}
    </button>
  );
}

function DropdownMenuContent({
  className,
  align = "start",
  children,
}: {
  className?: string;
  align?: "start" | "end";
  children: React.ReactNode;
}) {
  const { open } = use(DropdownContext);
  if (!open) return null;

  return (
    <div
      className={cn(
        "absolute top-full mt-1 z-50 min-w-[8rem] overflow-hidden rounded-xl py-1",
        "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm shadow-lg border border-zinc-200/40 dark:border-zinc-700/40",
        align === "end" ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DropdownMenuItem({
  className,
  variant = "default",
  onSelect,
  children,
  ...props
}: {
  className?: string;
  variant?: "default" | "destructive";
  onSelect?: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const { setOpen } = use(DropdownContext);

  return (
    <button
      type="button"
      className={cn(
        "w-full px-3 py-1.5 text-left text-sm outline-none select-none transition-colors duration-150 flex items-center gap-2 cursor-default",
        variant === "default" &&
          "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100",
        variant === "destructive" &&
          "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      onClick={() => {
        onSelect?.();
        setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <div className={cn("my-1 h-px bg-zinc-100 dark:bg-zinc-800", className)} />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
```

- [ ] **Step 2: Verify consumers still work**

The API shape is intentionally similar to Radix (`DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator`). Consumers (ActionsMenu, SettingsModal) should need minimal changes — mainly removing unused imports like `DropdownMenuGroup` or `DropdownMenuLabel` if referenced.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/DropdownMenu.tsx
git commit -m "refactor: replace Radix DropdownMenu with lightweight custom dropdown"
```

---

### Task 15: Replace cva/Slot in Button and Text

Remove `class-variance-authority` and `@radix-ui/react-slot` dependencies from Button and Text. Use plain Tailwind class helpers.

**Files:**
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/Text.tsx`

- [ ] **Step 1: Rewrite Button.tsx**

```tsx
// src/components/ui/Button.tsx
import { cn } from "../../lib/utils";

const baseStyles =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

const variantStyles = {
  default: "bg-blue-600 text-white hover:bg-blue-700",
  secondary:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700",
  outline:
    "border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
  ghost:
    "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  link: "text-zinc-600 dark:text-zinc-400 underline-offset-4 hover:underline",
} as const;

const sizeStyles = {
  default: "h-9 px-4",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6",
  icon: "size-9",
} as const;

type ButtonVariant = keyof typeof variantStyles;
type ButtonSize = keyof typeof sizeStyles;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    />
  );
}

export { Button };
export type { ButtonVariant, ButtonSize };
```

- [ ] **Step 2: Rewrite Text.tsx**

```tsx
// src/components/ui/Text.tsx
import { use } from "react";
import { SettingsContext } from "../../contexts/SettingsContext";
import { cn } from "../../lib/utils";
import { FontFamilies } from "../../types";

const variantStyles = {
  title: "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100",
  section: "text-sm font-medium text-zinc-900 dark:text-zinc-100",
  subsection: "text-xs font-medium text-zinc-700 dark:text-zinc-300",
  overline: "text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider",
  body: "text-sm text-zinc-600 dark:text-zinc-400",
  caption: "text-xs text-zinc-500 dark:text-zinc-400",
  micro: "text-[10px] text-zinc-400 dark:text-zinc-500",
} as const;

type TextVariant = keyof typeof variantStyles;

interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  as?: "p" | "span" | "div" | "h1" | "h2" | "h3" | "label";
}

function Text({
  className,
  variant = "body",
  as: Tag = "p",
  ...props
}: TextProps) {
  const settings = use(SettingsContext);
  const fontClass = settings
    ? settings.fontFamily === FontFamilies.SANS_SERIF
      ? "font-sans"
      : "font-serif"
    : undefined;

  return (
    <Tag
      className={cn(fontClass, variantStyles[variant], className)}
      {...props}
    />
  );
}

export { Text, variantStyles as textVariants };
export type { TextVariant };
```

**IMPORTANT cross-cutting changes:**

1. The `asChild` pattern is removed. All consumers (13 files!) that use `<Text asChild>` must switch to `<Text as="span">` (or `as="h1"`, etc). Similarly, `<Button asChild>` usages become plain `<button>` elements with Button's styles.

2. `textVariants` changes from a cva function `textVariants({ variant: "caption" })` to a plain object `variantStyles.caption`. The export alias is kept for compatibility, but ALL call sites must change from function syntax to property access. Known consumers: `App.tsx` (Toaster options), `DropdownMenu.tsx` (rewritten in Task 14), `Dialog.tsx` (rewritten in Task 13).

Search for all `asChild` usages and update them:

```bash
grep -r "asChild" src/ --include="*.tsx" -l
```

Each `<Text variant="title" asChild><h1>` becomes `<Text variant="title" as="h1">`.
Each `<Text variant="caption" asChild><span>` becomes `<Text variant="caption" as="span">`.

Similarly, `<Button asChild>` usages need to be converted to plain `<button>` or `<a>` elements with Button's styles applied via className.

- [ ] **Step 3: Update all asChild consumers**

Search and replace all `asChild` usages across the codebase. Common patterns:

```tsx
// Before
<Text variant="title" asChild><h1>readit</h1></Text>
// After
<Text variant="title" as="h1">readit</Text>

// Before
<Text variant="caption" asChild><span>...</span></Text>
// After
<Text variant="caption" as="span">...</Text>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Button.tsx src/components/ui/Text.tsx
git add -A  # catch all consumer updates
git commit -m "refactor: replace cva/Slot with plain Tailwind helpers in Button and Text"
```

---

### Task 16: Remove Radix and cva packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Uninstall packages**

```bash
bun remove @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-slot class-variance-authority
```

- [ ] **Step 2: Verify build**

```bash
bun run typecheck && bun run build
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: remove Radix UI and class-variance-authority dependencies"
```

---

### Task 17: Final verification (phase 2)

- [ ] **Step 1: Run full check suite**

```bash
bun run typecheck && bun run test && bun run check && bun run build
```

- [ ] **Step 2: Manual smoke test**

Same verification as Task 12 Step 5, plus:
- Settings modal opens and closes correctly (native dialog)
- Actions dropdown opens/closes, items are clickable
- All dropdown menus in settings work (theme, font, language)
- No console errors

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "chore: pruning complete — removed features, Radix, cva"
```

---

## Out of Scope (Future Tasks)

These are high-impact optimizations identified during analysis but not part of this pruning pass:

1. **Lazy-load mermaid** — dynamic `import()` only when mermaid fences detected. Currently loads ~2MB+ eagerly.
2. **Replace react-syntax-highlighter** — switch to Shiki (lighter, tree-shakeable) or plain `<pre>` with minimal highlighting.
3. **Simplify CSS utility stack** — currently using `clsx` + `tailwind-merge`. After removing `cva`, evaluate if both are still needed.
4. **Flatten remaining state layers** — the Zustand store + CommentContext + hooks could be simplified further.
5. **Lazy-load heavy components** — `React.lazy()` for SettingsModal, RawModal, MermaidDiagram.
