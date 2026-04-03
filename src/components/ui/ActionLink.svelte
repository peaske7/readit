<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

const variantStyles = {
  default: "hover:text-zinc-600",
  destructive: "hover:text-red-500",
} as const;

type ActionLinkVariant = keyof typeof variantStyles;

interface Props {
  variant?: ActionLinkVariant;
  onclick?: (e: MouseEvent) => void;
  class?: string;
  disabled?: boolean;
  children: Snippet;
}

let {
  variant = "default",
  onclick,
  class: className,
  disabled = false,
  children,
}: Props = $props();
</script>

<button
  type="button"
  {disabled}
  class={cn(
    "cursor-pointer transition-colors duration-150",
    variantStyles[variant],
    className,
  )}
  {onclick}
>
  {@render children()}
</button>
