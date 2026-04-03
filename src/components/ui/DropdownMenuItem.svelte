<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

interface Props {
  variant?: "default" | "destructive";
  onselect?: () => void;
  class?: string;
  title?: string;
  children: Snippet;
}

let {
  variant = "default",
  onselect,
  class: className,
  title,
  children,
}: Props = $props();
</script>

<button
  type="button"
  role="menuitem"
  {title}
  class={cn(
    "w-full px-3 py-1.5 text-left text-sm outline-none select-none transition-colors duration-150 flex items-center gap-2 cursor-default",
    variant === "default" &&
      "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 focus-visible:bg-zinc-50 dark:focus-visible:bg-zinc-800 focus-visible:text-zinc-900 dark:focus-visible:text-zinc-100",
    variant === "destructive" &&
      "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300 focus-visible:bg-red-50 dark:focus-visible:bg-red-950 focus-visible:text-red-700 dark:focus-visible:text-red-300",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
    className,
  )}
  onclick={() => onselect?.()}
>
  {@render children()}
</button>
