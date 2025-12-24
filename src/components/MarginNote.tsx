import { cva } from "class-variance-authority";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import type { Comment } from "../types";

interface MarginNoteProps {
  comment: Comment;
  top: number;
  isHovered?: boolean;
  commentIndex?: number;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onCopyForLLM: (comment: Comment) => void;
}

const confidenceVariants = cva("", {
  variants: {
    confidence: {
      exact: "",
      normalized: "", // Whitespace-normalized match - as reliable as exact
      fuzzy: "border-l-2 border-l-yellow-400",
      unresolved: "border-l-2 border-l-red-400 opacity-75",
    },
  },
  defaultVariants: { confidence: "exact" },
});

const selectedTextVariants = cva(
  "text-sm italic mb-1 line-clamp-1 flex items-center gap-1 transition-colors duration-150",
  {
    variants: {
      hovered: {
        true: "text-gray-600",
        false: "text-gray-400",
      },
    },
    defaultVariants: { hovered: false },
  },
);

const commentTextVariants = cva(
  "text-sm whitespace-pre-wrap transition-colors duration-150",
  {
    variants: {
      hovered: {
        true: "text-gray-800",
        false: "text-gray-500",
      },
    },
    defaultVariants: { hovered: false },
  },
);

const badgeVariants = cva(
  "absolute -left-4 top-2 text-xs tabular-nums transition-colors duration-150",
  {
    variants: {
      hovered: {
        true: "text-gray-600",
        false: "text-gray-400",
      },
    },
    defaultVariants: { hovered: false },
  },
);

export function MarginNote({
  comment,
  top,
  isHovered = false,
  commentIndex = 0,
  onEdit,
  onDelete,
  onCopyForLLM,
}: MarginNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment);

  const handleSave = () => {
    onEdit(comment.id, editText);
    setIsEditing(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(
      `Selected: "${comment.selectedText}"\nComment: ${comment.comment}`,
    );
    toast.success("Copied");
  };

  const createdAtFormatted = new Date(comment.createdAt).toLocaleString();

  return (
    <div
      className="absolute left-0 right-0 group"
      style={{ top }}
      title={`Added: ${createdAtFormatted}`}
    >
      {/* Footnote-style number badge */}
      <span className={badgeVariants({ hovered: isHovered })}>
        {commentIndex + 1}
      </span>

      <div
        className={cn(
          "relative border-t border-gray-200 pt-2 pb-3 pl-6 transition-all duration-200",
          confidenceVariants({
            confidence: comment.anchorConfidence || "exact",
          }),
        )}
      >
        <div
          className={cn(
            "font-serif",
            selectedTextVariants({ hovered: isHovered }),
          )}
        >
          <span>"{comment.selectedText}"</span>
          {comment.anchorConfidence === "fuzzy" && (
            <span
              className="text-yellow-600 text-xs"
              title="Anchor position may have shifted"
            >
              ⚠
            </span>
          )}
          {comment.anchorConfidence === "unresolved" && (
            <span
              className="text-red-600 text-xs"
              title="Could not locate original text in document"
            >
              ⚠
            </span>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 resize-none focus:outline-none focus:border-gray-400"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) {
                  handleSave();
                }
                if (e.key === "Escape") {
                  setIsEditing(false);
                  setEditText(comment.comment);
                }
              }}
            />
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={handleSave}
                className="text-gray-600 underline hover:text-gray-900"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditText(comment.comment);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <p
              className={cn(
                "font-serif",
                commentTextVariants({ hovered: isHovered }),
              )}
            >
              {comment.comment}
            </p>
            <div className="flex gap-3 mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-sm">
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
                className="text-gray-400 hover:text-red-500"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="text-gray-400 hover:text-gray-600"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => onCopyForLLM(comment)}
                className="text-gray-400 hover:text-gray-600"
                title="Copy with context for LLM"
              >
                LLM
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
