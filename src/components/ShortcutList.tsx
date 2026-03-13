import { useCallback, useMemo, useState } from "react";
import {
  bindingsEqual,
  formatBinding,
  type ShortcutBinding,
  type ShortcutDefinition,
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
                  onCapture={(binding) => handleCapture(shortcut.id, binding)}
                  onCancel={() => setCapturingId(undefined)}
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
