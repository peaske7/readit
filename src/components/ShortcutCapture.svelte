<script lang="ts">
import { onMount } from "svelte";
import { cn } from "../lib/utils";
import {
  eventToBinding,
  formatBinding,
  isReservedBinding,
} from "../lib/shortcut-registry";
import type { ShortcutBinding } from "../schema";
import { t } from "../stores/locale.svelte";

interface Props {
  oncapture: (binding: ShortcutBinding) => void;
  oncancel: () => void;
}

let { oncapture, oncancel }: Props = $props();

let captureEl: HTMLDivElement | undefined = $state();
let error = $state<string | null>(null);
const isMac = navigator.platform.includes("Mac");

function handleKeyDown(e: KeyboardEvent) {
  e.preventDefault();
  e.stopPropagation();

  if (
    e.key === "Alt" ||
    e.key === "Shift" ||
    e.key === "Control" ||
    e.key === "Meta"
  ) {
    return;
  }

  if (e.key === "Escape" && !e.altKey && !e.metaKey && !e.shiftKey) {
    oncancel();
    return;
  }

  const binding = eventToBinding(e);

  if (isReservedBinding(binding)) {
    error = t("shortcutCapture.reserved", {
      binding: formatBinding(binding, isMac),
    });
    return;
  }

  error = null;
  oncapture(binding);
}

onMount(() => {
  captureEl?.focus();
});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  role="button"
  aria-label={t("shortcutCapture.ariaLabel")}
  bind:this={captureEl}
  tabindex={0}
  onkeydown={handleKeyDown}
  onblur={oncancel}
  class={cn(
    "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
    "bg-amber-50 dark:bg-amber-900/30",
    "border border-amber-300 dark:border-amber-600",
    "text-amber-700 dark:text-amber-300",
    "outline-none ring-2 ring-amber-400/50",
    "animate-pulse",
  )}
>
  <span>{t("shortcutCapture.pressKeys")}</span>
  {#if error}
    <span class="text-red-500 dark:text-red-400 text-[10px] animate-none"
      >{error}</span
    >
  {/if}
</div>
