import { BotMessageSquare, Copy } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";
import { LayoutContext } from "../../contexts/LayoutContext";
import { cn } from "../../lib/utils";
import { FontFamilies } from "../../types";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";

interface CommentInputProps {
  selectedText: string | null;
  onSubmit: (commentText: string) => void;
  onCancel: () => void;
  onCopyRaw: () => void;
  onCopyForLLM: () => void;
}

export function CommentInput({
  selectedText,
  onSubmit,
  onCancel,
  onCopyRaw,
  onCopyForLLM,
}: CommentInputProps) {
  const layout = use(LayoutContext);
  const fontClass = layout
    ? layout.fontFamily === FontFamilies.SANS_SERIF
      ? "font-sans"
      : "font-serif"
    : undefined;

  const [commentText, setCommentText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedText && textareaRef.current) {
      // Only auto-focus on devices with precise pointing (desktop)
      if (window.matchMedia("(pointer: fine)").matches) {
        textareaRef.current.focus();
      }
    }
  }, [selectedText]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when selection changes
  useEffect(() => {
    setCommentText("");
  }, [selectedText]);

  const handleSubmit = () => {
    onSubmit(commentText.trim());
    setCommentText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  if (!selectedText) {
    return null;
  }

  return (
    <div data-comment-input className="border-t border-zinc-200 pt-3 pb-2">
      <Text variant="caption" asChild>
        <div className="italic mb-2 line-clamp-2">"{selectedText}"</div>
      </Text>
      <textarea
        ref={textareaRef}
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder="Add your comment..."
        className={cn(
          fontClass,
          "w-full px-2 py-1.5 text-sm border border-zinc-200 resize-none focus:outline-none focus:border-zinc-400",
        )}
        rows={2}
        onKeyDown={handleKeyDown}
      />
      <div className="flex justify-end items-center gap-3 mt-2 text-sm">
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-zinc-300 hover:text-zinc-500"
            onClick={onCopyRaw}
            title="Copy raw text (⌘C)"
            aria-label="Copy raw text"
          >
            <Copy size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-zinc-300 hover:text-zinc-500"
            onClick={onCopyForLLM}
            title="Copy with context for LLM (⌘⇧C)"
            aria-label="Copy for LLM"
          >
            <BotMessageSquare size={14} />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="link" size="sm" onClick={handleSubmit} title="⌘↵">
          {commentText.trim() ? "Add Note" : "Highlight"}
        </Button>
      </div>
    </div>
  );
}
