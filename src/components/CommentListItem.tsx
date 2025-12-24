import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { Comment } from "../types";

interface CommentListItemProps {
  comment: Comment;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onGoTo: (id: string) => void;
  onReanchor?: (id: string) => void;
}

export function CommentListItem({
  comment,
  onEdit,
  onDelete,
  onGoTo,
  onReanchor,
}: CommentListItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isUnresolved = comment.anchorConfidence === "unresolved";
  const canGoTo = !isUnresolved;

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editText.trim()) {
      onEdit(comment.id, editText);
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditText(comment.comment);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        "group px-3 py-2 border-b border-gray-100 last:border-b-0",
        isUnresolved && "opacity-50",
      )}
    >
      {/* Selected text preview */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-serif text-sm text-gray-400 italic line-clamp-1">
          "{comment.selectedText}"
        </span>
        {isUnresolved && (
          <span className="text-xs text-gray-400 shrink-0">· unresolved</span>
        )}
      </div>

      {/* Comment text or edit mode */}
      {isEditing ? (
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 resize-none focus:outline-none focus:border-gray-400 font-serif"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.metaKey) {
                handleSave();
              }
              if (e.key === "Escape") {
                handleCancel();
              }
            }}
          />
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              onClick={handleSave}
              className="text-gray-600 hover:text-gray-900"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="font-serif text-sm text-gray-600 line-clamp-2">
            {comment.comment}
          </p>

          {/* Actions - hover reveal */}
          <div className="flex gap-3 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-xs">
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="text-gray-400 hover:text-gray-600"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="text-gray-400 hover:text-gray-600"
            >
              Delete
            </button>
            {canGoTo && (
              <button
                type="button"
                onClick={() => onGoTo(comment.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                Go to
              </button>
            )}
            {isUnresolved && onReanchor && (
              <button
                type="button"
                onClick={() => onReanchor(comment.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                Re-anchor
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
