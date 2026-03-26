import { cn } from "../../lib/utils";

const variantStyles = {
  default: "hover:text-zinc-600",
  destructive: "hover:text-red-500",
} as const;

type ActionLinkVariant = keyof typeof variantStyles;

function ActionLink({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"button"> & { variant?: ActionLinkVariant }) {
  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer transition-colors duration-150",
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export { ActionLink };
