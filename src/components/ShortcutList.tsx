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

const SHORTCUT_GROUPS = [
  {
    label: "Copy",
    ids: ["copyAll", "copyAllRaw", "copySelectionRaw", "copySelectionLLM"],
  },
  { label: "Navigate", ids: ["navigateNext", "navigatePrevious"] },
  { label: "Other", ids: ["clearSelection"] },
] as const;

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

  const shortcutMap = useMemo(
    () => new Map(shortcuts.map((s) => [s.id, s])),
    [shortcuts],
  );

  const handleCapture = useCallback(
    async (id: string, binding: ShortcutBinding) => {
      const conflict = shortcuts.find(
        (s) => s.id !== id && s.enabled && bindingsEqual(s.binding, binding),
      );

      if (conflict) {
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
    <div className="space-y-4">
      {SHORTCUT_GROUPS.map((group) => {
        const groupShortcuts = group.ids
          .map((id) => shortcutMap.get(id))
          .filter((s): s is ShortcutDefinition => s !== undefined);

        if (groupShortcuts.length === 0) return null;

        return (
          <div key={group.label}>
            <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              {group.label}
            </span>
            <div className="mt-1 space-y-0.5">
              {groupShortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center gap-3 py-1.5"
                >
                  <span
                    className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate"
                    title={shortcut.description}
                  >
                    {shortcut.label}
                  </span>

                  <div className="flex items-center gap-2.5">
                    {capturingId === shortcut.id ? (
                      <ShortcutCapture
                        onCapture={(binding) =>
                          handleCapture(shortcut.id, binding)
                        }
                        onCancel={() => setCapturingId(undefined)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCapturingId(shortcut.id)}
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs font-mono cursor-pointer hover:bg-zinc-200 hover:border-zinc-300 dark:hover:bg-zinc-700 dark:hover:border-zinc-600 transition-colors"
                      >
                        {formatBinding(shortcut.binding, isMac)}
                      </button>
                    )}

                    <button
                      type="button"
                      role="switch"
                      aria-checked={shortcut.enabled}
                      onClick={() => onToggleEnabled(shortcut.id)}
                      title="Enable/disable shortcut"
                      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        shortcut.enabled
                          ? "bg-zinc-600 dark:bg-zinc-400"
                          : "bg-zinc-300 dark:bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`inline-block size-3 rounded-full bg-white dark:bg-zinc-900 shadow-sm transition-transform ${
                          shortcut.enabled
                            ? "translate-x-3.5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={hasOverrides ? onResetToDefaults : undefined}
        disabled={!hasOverrides}
        className={
          hasOverrides
            ? "text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
            : "text-xs text-zinc-300 dark:text-zinc-600 cursor-default"
        }
      >
        Reset to defaults
      </button>
    </div>
  );
}
