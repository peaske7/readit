<script lang="ts">
import {
  formatBinding,
  type ShortcutAction,
} from "../../lib/shortcut-registry";
import { cn } from "../../lib/utils";
import { shortcutState } from "../../stores/shortcuts.svelte";

const IS_MAC =
  typeof navigator !== "undefined" && navigator.platform.includes("Mac");

interface Props {
  action: ShortcutAction;
  class?: string;
}

let { action, class: className }: Props = $props();

let shortcut = $derived(shortcutState.shortcuts.find((s) => s.id === action));
let label = $derived(
  shortcut?.enabled ? formatBinding(shortcut.binding, IS_MAC) : "",
);
</script>

{#if label}
  <span
    class={cn(
      "text-zinc-400 dark:text-zinc-500 text-xs tabular-nums select-none",
      className,
    )}
  >
    {label}
  </span>
{/if}
