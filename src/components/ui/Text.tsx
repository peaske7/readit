import { use } from "react";
import { SettingsContext } from "../../contexts/SettingsContext";
import { cn } from "../../lib/utils";
import { FontFamilies } from "../../schema";

const variantStyles = {
  title:
    "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100",
  section: "text-sm font-medium text-zinc-900 dark:text-zinc-100",
  subsection: "text-xs font-medium text-zinc-700 dark:text-zinc-300",
  overline:
    "text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider",
  body: "text-sm text-zinc-600 dark:text-zinc-400",
  caption: "text-xs text-zinc-500 dark:text-zinc-400",
  micro: "text-[10px] text-zinc-400 dark:text-zinc-500",
} as const;

type TextVariant = keyof typeof variantStyles;

interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  as?: "p" | "span" | "div" | "h1" | "h2" | "h3" | "label" | "pre";
}

function Text({
  className,
  variant = "body",
  as: Tag = "p",
  ...props
}: TextProps) {
  const settings = use(SettingsContext);
  const fontClass = settings
    ? settings.fontFamily === FontFamilies.SANS_SERIF
      ? "font-sans"
      : "font-serif"
    : undefined;

  return (
    <Tag
      className={cn(fontClass, variantStyles[variant], className)}
      {...props}
    />
  );
}

export type { TextVariant };
export { Text, variantStyles };
