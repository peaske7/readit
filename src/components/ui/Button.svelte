<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLButtonAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

const baseStyles =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0";

const variantStyles = {
  default: "bg-blue-600 text-white hover:bg-blue-700",
  secondary:
    "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700",
  outline:
    "border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800",
  ghost:
    "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  link: "text-zinc-600 dark:text-zinc-400 underline-offset-4 hover:underline",
} as const;

const sizeStyles = {
  default: "h-9 px-4",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6",
  icon: "size-9",
} as const;

type ButtonVariant = keyof typeof variantStyles;
type ButtonSize = keyof typeof sizeStyles;

interface Props extends HTMLButtonAttributes {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: Snippet;
}

let {
  variant = "default",
  size = "default",
  class: className,
  type = "button",
  children,
  ...rest
}: Props = $props();
</script>

<button
  {...rest}
  {type}
  class={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
>
  {@render children()}
</button>
