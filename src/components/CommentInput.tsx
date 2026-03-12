import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Text } from "./ui/text";

const CopyIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CopyForLLMIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    <circle cx="18" cy="5" r="3" fill="currentColor" />
  </svg>
);

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
  const [commentText, setCommentText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea when selection becomes active
  useEffect(() => {
    if (selectedText && textareaRef.current) {
      // Only auto-focus on devices with precise pointing (desktop)
      if (window.matchMedia("(pointer: fine)").matches) {
        textareaRef.current.focus();
      }
    }
  }, [selectedText]);

  // Clear input when selection changes
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
        <div className="font-serif italic mb-2 line-clamp-2">
          "{selectedText}"
        </div>
      </Text>
      <textarea
        ref={textareaRef}
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder="Add your comment..."
        className="w-full px-2 py-1.5 text-sm border border-zinc-200 resize-none focus:outline-none focus:border-zinc-400"
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
            {CopyIcon}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-zinc-300 hover:text-zinc-500"
            onClick={onCopyForLLM}
            title="Copy with context for LLM (⌘⇧C)"
            aria-label="Copy for LLM"
          >
            {CopyForLLMIcon}
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
