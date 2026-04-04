<script lang="ts">
import {
  bindingsEqual,
  formatBinding,
  type ShortcutDefinition,
} from "../lib/shortcut-registry";
import type { ShortcutBinding } from "../schema";
import { cn } from "../lib/utils";
import { t } from "../stores/locale.svelte";
import {
  shortcutState,
  resetToDefaults,
  toggleEnabled,
  updateBinding,
} from "../stores/shortcuts.svelte";
import Button from "./ui/Button.svelte";
import Text from "./ui/Text.svelte";
import ShortcutCapture from "./ShortcutCapture.svelte";
import { SHORTCUT_GROUPS } from "../lib/shortcut-registry";

const isMac = navigator.platform.includes("Mac");
let capturingId = $state<string | null>(null);

function handleCapture(id: string, binding: ShortcutBinding) {
  capturingId = null;
  updateBinding(id, binding);
}

function handleCancelCapture() {
  capturingId = null;
}

function startCapture(id: string) {
  capturingId = id;
}

function getShortcut(id: string): ShortcutDefinition | undefined {
  return shortcutState.shortcuts.find((s) => s.id === id);
}

function isModified(shortcut: ShortcutDefinition): boolean {
  return (
    !shortcut.enabled ||
    !bindingsEqual(shortcut.binding, shortcut.defaultBinding)
  );
}

let hasModifications = $derived(
  shortcutState.shortcuts.some((s) => isModified(s)),
);
</script>

<div class="space-y-4">
  {#each SHORTCUT_GROUPS as group (group.label)}
    <div>
      <Text variant="caption" as="div" class="mb-2 font-medium">
        {t(group.label)}
      </Text>

      <div class="space-y-1">
        {#each group.ids as id (id)}
          {@const shortcut = getShortcut(id)}
          {#if shortcut}
            <div
              class={cn(
                "flex items-center gap-3 px-2 py-1.5 rounded-lg",
                "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                !shortcut.enabled && "opacity-50",
              )}
            >
              <div class="flex-1 min-w-0">
                <div class="text-xs text-zinc-700 dark:text-zinc-300">
                  {t(shortcut.label)}
                </div>
              </div>

              <div class="flex items-center gap-2">
                {#if capturingId === shortcut.id}
                  <ShortcutCapture
                    oncapture={(binding) =>
                      handleCapture(shortcut.id, binding)}
                    oncancel={handleCancelCapture}
                  />
                {:else}
                  <button
                    type="button"
                    onclick={() => startCapture(shortcut.id)}
                    class={cn(
                      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-mono",
                      "bg-zinc-100 dark:bg-zinc-800",
                      "border border-zinc-200 dark:border-zinc-700",
                      "text-zinc-600 dark:text-zinc-400",
                      "hover:bg-zinc-200 dark:hover:bg-zinc-700",
                      "transition-colors cursor-pointer",
                      isModified(shortcut) &&
                        "ring-1 ring-blue-400/50 dark:ring-blue-500/50",
                    )}
                  >
                    {formatBinding(shortcut.binding, isMac)}
                  </button>
                {/if}

                <label
                  class="relative inline-flex items-center cursor-pointer"
                  title={t("shortcuts.enableDisable")}
                >
                  <input
                    type="checkbox"
                    checked={shortcut.enabled}
                    onchange={() => toggleEnabled(shortcut.id)}
                    class="sr-only peer"
                  />
                  <div
                    class={cn(
                      "w-7 h-4 rounded-full transition-colors",
                      "bg-zinc-200 dark:bg-zinc-700",
                      "peer-checked:bg-blue-500 dark:peer-checked:bg-blue-600",
                      "after:content-[''] after:absolute after:top-0.5 after:start-[2px]",
                      "after:bg-white after:rounded-full after:size-3",
                      "after:transition-all after:duration-150",
                      "peer-checked:after:translate-x-full peer-checked:after:translate-x-3",
                    )}
                  ></div>
                </label>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/each}

  {#if hasModifications}
    <div class="pt-2 border-t border-zinc-100 dark:border-zinc-800">
      <Button
        variant="ghost"
        size="sm"
        onclick={resetToDefaults}
        class="text-xs"
      >
        {t("shortcuts.resetToDefaults")}
      </Button>
    </div>
  {/if}
</div>
