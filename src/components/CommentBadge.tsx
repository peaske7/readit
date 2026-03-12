import { useState } from "react";
import { useCommentContext } from "../contexts/CommentContext";
import { cn } from "../lib/utils";
import { CommentManager } from "./CommentManager";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function CommentBadge() {
  const { commentCount } = useCommentContext();

  const [commentsOpen, setCommentsOpen] = useState(false);

  if (commentCount === 0) return null;

  return (
    <DropdownMenu open={commentsOpen} onOpenChange={setCommentsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 text-xs tabular-nums select-none transition-colors",
            commentsOpen
              ? "text-zinc-600"
              : "text-zinc-400 hover:text-zinc-600",
          )}
          title={`${commentCount} comment${commentCount !== 1 ? "s" : ""}`}
        >
          <span className="text-zinc-300">·</span>
          {commentCount}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 max-h-96 overflow-hidden p-0"
      >
        <CommentManager onClose={() => setCommentsOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
