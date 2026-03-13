# Keyboard Shortcuts — Centralized System with Rebinding

## Summary

Consolidate scattered keyboard shortcut handling into a centralized registry with a single `keydown` listener. Add the missing "Copy All" shortcuts (`Alt+C` / `Alt+Shift+C`). Provide a settings UI for rebinding and enabling/disabling shortcuts, persisted server-side in `~/.readit/settings/`.

## Shortcut Registry

All shortcuts defined as data in `src/lib/shortcut-registry.ts`:

| Action | ID | Default Binding | Description |
|--------|----|----------------|-------------|
| Copy All (AI) | `copyAll` | `Alt+C` | Copy all comments in AI prompt format |
| Copy All (Raw) | `copyAllRaw` | `Alt+Shift+C` | Copy all comments as raw text |
| Next Comment | `navigateNext` | `Alt+↓` | Navigate to next comment |
| Previous Comment | `navigatePrevious` | `Alt+↑` | Navigate to previous comment |
| Copy Selection (Raw) | `copySelectionRaw` | `⌘+C` | Copy selected text raw |
| Copy Selection (LLM) | `copySelectionLLM` | `⌘+Shift+C` | Copy selected text for LLM |
| Clear Selection | `clearSelection` | `Escape` | Clear text selection |

### Types

```ts
interface ShortcutBinding {
  key: string;       // e.g. "c", "ArrowUp"
  alt?: boolean;
  meta?: boolean;    // ⌘ on Mac, Ctrl on Windows/Linux
  shift?: boolean;
}

interface ShortcutDefinition {
  id: string;
  label: string;
  description: string;
  defaultBinding: ShortcutBinding;
  enabled: boolean;
}

interface KeybindingOverride {
  id: string;
  binding?: ShortcutBinding;
  enabled: boolean;
}
```

## Persistence

Extend existing `DocumentSettings`:

```ts
interface DocumentSettings {
  version: number;
  fontFamily: FontFamily;
  keybindings?: KeybindingOverride[];  // optional for backwards compat
}
```

No new API endpoints. The existing `GET /api/settings` and `PUT /api/settings` handle the new field. Missing `keybindings` = all defaults.

## Hook Architecture

### `useKeyboardShortcuts(actions)`

- Single `window.addEventListener("keydown", ...)` replacing scattered listeners
- Matches events against all enabled bindings (defaults merged with overrides)
- Calls `actions[shortcut.id]()` on match
- Suppressed when focus is in `<input>`, `<textarea>`, or `[contenteditable]`
- Conditional shortcuts: copy selection only fires when selection exists
- `⌘C` without selection falls through to native browser copy

### `useKeybindings()`

- Manages custom bindings state
- Merges user overrides with defaults from registry
- Persists via existing settings API

### Removed Code

- `useCommentNavigation.ts`: Delete the `useEffect` keydown block (lines 119-136)
- `useClipboard.ts`: Delete the `useEffect` keydown block (lines 84-103)

Action callbacks remain in their original hooks — only key listening moves.

## Settings UI

New "Keyboard Shortcuts" section in `SettingsModal`:

- List of all shortcuts with checkbox (enable/disable) and current binding
- Edit (pencil) icon enters capture mode: "Press keys..."
- Escape cancels capture without changing
- Conflict detection: warns if new binding collides with another shortcut, offers swap or cancel
- "Reset to Defaults" button at the bottom
- Dialog widened from `max-w-sm` to `max-w-md`

### Components

- `ShortcutList` — renders shortcuts with toggles and edit buttons
- `ShortcutCapture` — inline key capture input

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/lib/shortcut-registry.ts` | Definitions, defaults, binding matcher, display formatter |
| `src/hooks/useKeyboardShortcuts.ts` | Single keydown listener, dispatch to actions |
| `src/hooks/useKeybindings.ts` | Custom bindings state, merge, persist |
| `src/components/ShortcutList.tsx` | Settings UI list |
| `src/components/ShortcutCapture.tsx` | Inline key capture |

### Modified Files

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `KeybindingOverride`, `ShortcutBinding`, extend `DocumentSettings` |
| `src/server/index.ts` | Handle `keybindings` in settings read/write |
| `src/hooks/useCommentNavigation.ts` | Remove keydown useEffect |
| `src/hooks/useClipboard.ts` | Remove keydown useEffect |
| `src/components/SettingsModal.tsx` | Add shortcuts section, widen dialog |
| `src/App.tsx` | Wire up `useKeyboardShortcuts` |

## Edge Cases

- **Backwards compat**: `keybindings` optional — missing means all defaults
- **Platform display**: Show `⌘` on Mac, `Ctrl` on Windows/Linux
- **Reserved keys**: Block rebinding to browser-reserved combos (`⌘+W`, `⌘+T`, etc.)
- **Escape during capture**: Cancels capture, does not trigger "Clear Selection"
- **Focus guard**: Shortcuts suppressed in text inputs
