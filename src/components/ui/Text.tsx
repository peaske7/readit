import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { use } from "react";
import { SettingsContext } from "../../contexts/SettingsContext";
import { cn } from "../../lib/utils";
import { FontFamilies } from "../../types";

const textVariants = cva("", {
  variants: {
    variant: {
      title:
        "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100",
      section: "text-sm font-medium text-zinc-900 dark:text-zinc-100",
      subsection: "text-xs font-medium text-zinc-700 dark:text-zinc-300",
      overline:
        "text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider",
      body: "text-sm text-zinc-600 dark:text-zinc-400",
      caption: "text-xs text-zinc-500 dark:text-zinc-400",
      micro: "text-[10px] text-zinc-400 dark:text-zinc-500",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

function Text({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"p"> &
  VariantProps<typeof textVariants> & {
    asChild?: boolean;
  }) {
  const settings = use(SettingsContext);
  const fontClass = settings
    ? settings.fontFamily === FontFamilies.SANS_SERIF
      ? "font-sans"
      : "font-serif"
    : undefined;

  const Comp = asChild ? Slot : "p";

  return (
    <Comp
      data-slot="text"
      className={cn(fontClass, textVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Text, textVariants };
