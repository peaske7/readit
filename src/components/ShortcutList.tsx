import { useCallback, useMemo, useState } from "react";
import { useLocale } from "../contexts/LocaleContext";
import type { TranslationKey } from "../lib/i18n";
import {
  bindingsEqual,
  formatBinding,
  type ShortcutAction,
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
    labelKey: "shortcutGroup.copy" as const,
    ids: ["copyAll", "copyAllRaw", "copySelectionRaw", "copySelectionLLM"],
  },
  {
    labelKey: "shortcutGroup.navigate" as const,
    ids: ["navigateNext", "navigatePrevious"],
  },
  { labelKey: "shortcutGroup.other" as const, ids: ["clearSelection"] },
] as const;

const SHORTCUT_LABEL_KEYS: Record<
  ShortcutAction,
  { label: TranslationKey; description: TranslationKey }
> = {
  copyAll: {
    label: "shortcut.copyAll.label",
    description: "shortcut.copyAll.description",
  },
  copyAllRaw: {
    label: "shortcut.copyAllRaw.label",
    description: "shortcut.copyAllRaw.description",
  },
  navigateNext: {
    label: "shortcut.navigateNext.label",
    description: "shortcut.navigateNext.description",
  },
  navigatePrevious: {
    label: "shortcut.navigatePrevious.label",
    description: "shortcut.navigatePrevious.description",
  },
  copySelectionRaw: {
    label: "shortcut.copySelectionRaw.label",
    description: "shortcut.copySelectionRaw.description",
  },
  copySelectionLLM: {
    label: "shortcut.copySelectionLLM.label",
    description: "shortcut.copySelectionLLM.description",
  },
  clearSelection: {
    label: "shortcut.clearSelection.label",
    description: "shortcut.clearSelection.description",
  },
};

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export function ShortcutList({
  shortcuts,
  onUpdateBinding,
  onToggleEnabled,
  onResetToDefaults,
}: ShortcutListProps) {
  const { t } = useLocale();
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
          <div key={group.labelKey}>
            <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              {t(group.labelKey)}
            </span>
            <div className="mt-1 space-y-0.5">
              {groupShortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center gap-3 py-1.5"
                >
                  <span
                    className="flex-1 text-sm text-zinc-700 dark:text-zinc-300 truncate"
                    title={t(SHORTCUT_LABEL_KEYS[shortcut.id].description)}
                  >
                    {t(SHORTCUT_LABEL_KEYS[shortcut.id].label)}
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
                      title={t("shortcuts.enableDisable")}
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
        {t("shortcuts.resetToDefaults")}
      </button>
    </div>
  );
}
