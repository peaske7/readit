import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const actionLinkVariants = cva(
  "cursor-pointer transition-colors duration-150",
  {
    variants: {
      variant: {
        default: "hover:text-zinc-600",
        destructive: "hover:text-red-500",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function ActionLink({
  className,
  variant,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof actionLinkVariants>) {
  return (
    <button
      type="button"
      data-slot="action-link"
      className={cn(actionLinkVariants({ variant, className }))}
      {...props}
    />
  );
}

export { ActionLink, actionLinkVariants };
