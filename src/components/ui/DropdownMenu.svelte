<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

interface Props {
  open?: boolean;
  trigger: Snippet;
  align?: "start" | "end";
  contentClass?: string;
  children: Snippet;
}

let {
  open = $bindable(false),
  trigger,
  align = "start",
  contentClass,
  children,
}: Props = $props();

let containerEl: HTMLDivElement | undefined = $state();

function toggle() {
  open = !open;
}

function close() {
  open = false;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && open) {
    e.stopPropagation();
    close();
  }
}

$effect(() => {
  if (!open) return;

  function handleClickOutside(e: MouseEvent) {
    if (containerEl && !containerEl.contains(e.target as Node)) {
      close();
    }
  }

  document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={containerEl}
  class="relative inline-block"
  onkeydown={handleKeydown}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div onclick={toggle} role="button" tabindex="-1">
    {@render trigger()}
  </div>

  {#if open}
    <div
      class={cn(
        "absolute top-full mt-1 z-50 min-w-[8rem] overflow-hidden rounded-xl py-1",
        "bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm shadow-lg border border-zinc-200/40 dark:border-zinc-700/40",
        align === "end" ? "right-0" : "left-0",
        contentClass,
      )}
    >
      {@render children()}
    </div>
  {/if}
</div>

<script lang="ts" module>
  export { default as DropdownMenuItem } from "./DropdownMenuItem.svelte";
  export { default as DropdownMenuSeparator } from "./DropdownMenuSeparator.svelte";
</script>
