import { useEffect, useRef, useState } from "react";

interface CommentInputAreaProps {
  selectedText: string | null;
  onSubmit: (commentText: string) => void;
  onCancel: () => void;
  onCopyForLLM: () => void;
}

export function CommentInputArea({
  selectedText,
  onSubmit,
  onCancel,
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
    if (!commentText.trim()) return;
    onSubmit(commentText);
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
      <div className="flex justify-between items-center mt-2 text-sm">
        <span className="text-gray-300">⌘↵ · ⌘⇧C</span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCopyForLLM}
            className="text-gray-400 hover:text-gray-600"
            title="Copy with context (⌘⇧C)"
          >
            Copy for LLM
          </button>
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
            disabled={!commentText.trim()}
            className="text-gray-600 underline hover:text-gray-900 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
