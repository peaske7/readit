import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const textVariants = cva("", {
  variants: {
    variant: {
      title: "text-lg font-semibold tracking-tight text-zinc-900",
      section: "text-sm font-medium text-zinc-900",
      subsection: "text-xs font-medium text-zinc-700",
      overline: "text-xs font-medium text-zinc-500 uppercase tracking-wider",
      body: "text-sm text-zinc-600",
      caption: "text-xs text-zinc-500",
      micro: "text-[10px] text-zinc-400",
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
  const Comp = asChild ? Slot : "p";

  return (
    <Comp
      data-slot="text"
      className={cn(textVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Text, textVariants };
