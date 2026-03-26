import { useEffect, useRef } from "react";
import {
  matchesBinding,
  type ShortcutAction,
  type ShortcutDefinition,
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
 * @param shortcuts - Resolved shortcut definitions (from useSettings)
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
