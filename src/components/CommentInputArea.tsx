import { useEffect, useRef, useState } from "react";

interface CommentInputAreaProps {
  selectedText: string | null;
  onSubmit: (commentText: string) => void;
  onCancel: () => void;
  onCopyRaw: () => void;
  onCopyForLLM: () => void;
}

export function CommentInputArea({
  selectedText,
  onSubmit,
  onCancel,
  onCopyRaw,
  onCopyForLLM,
}: CommentInputAreaProps) {
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

  // Inactive state - no selection
  if (!selectedText) {
    return null;
  }

  // Active state - has selection
  return (
    <div data-comment-input className="border-t border-gray-200 pt-3 pb-2">
      <div className="font-serif text-sm text-gray-400 italic mb-2 line-clamp-2">
        "{selectedText}"
      </div>
      <textarea
        ref={textareaRef}
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder="Add your comment..."
        className="w-full px-2 py-1.5 text-sm border border-gray-200 resize-none focus:outline-none focus:border-gray-400"
        rows={2}
        onKeyDown={handleKeyDown}
      />
      <div className="flex justify-end items-center gap-3 mt-2 text-sm">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onCopyRaw}
            className="text-gray-300 hover:text-gray-500 transition-colors"
            title="Copy raw text (⌘C)"
            aria-label="Copy raw text"
          >
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
          </button>
          <button
            type="button"
            onClick={onCopyForLLM}
            className="text-gray-300 hover:text-gray-500 transition-colors"
            title="Copy with context for LLM (⌘⇧C)"
            aria-label="Copy for LLM"
          >
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
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="text-gray-600 underline hover:text-gray-900"
          title="⌘↵"
        >
          {commentText.trim() ? "Add Note" : "Highlight"}
        </button>
      </div>
    </div>
  );
}
