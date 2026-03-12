import { cn } from "../../lib/utils";

function ActionBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="action-bar"
      className={cn(
        "flex items-center text-xs text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity",
        className,
      )}
      {...props}
    />
  );
}

export { ActionBar };
