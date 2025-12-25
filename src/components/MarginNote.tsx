import { cva } from "class-variance-authority";
import { useState } from "react";
import { cn } from "../lib/utils";
import type { Comment } from "../types";

interface MarginNoteProps {
  comment: Comment;
  top: number;
  isHovered?: boolean;
  commentIndex?: number;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onCopyRaw: (comment: Comment) => void;
  onCopyForLLM: (comment: Comment) => void;
  /** Called when mouse enters/leaves the note */
  onHover?: (commentId: string | undefined) => void;
}

const confidenceVariants = cva("", {
  variants: {
    confidence: {
      exact: "",
      normalized: "",
      fuzzy: "",
      unresolved: "opacity-60",
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
  onCopyRaw,
  onCopyForLLM,
  onHover,
}: MarginNoteProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.comment);

  const hasNote = comment.comment.trim().length > 0;

  const handleSave = () => {
    onEdit(comment.id, editText);
    setIsEditing(false);
  };

  const handleCopy = () => {
    onCopyRaw(comment);
  };

  const createdAtFormatted = new Date(comment.createdAt).toLocaleString();

  // Highlight-only (no note): minimal em-dash marker
  if (!hasNote && !isEditing) {
    return (
      <article
        className="absolute left-0 right-0 group"
        style={{ top }}
        title={`Added: ${createdAtFormatted}`}
        onMouseEnter={() => onHover?.(comment.id)}
        onMouseLeave={() => onHover?.(undefined)}
      >
        <span className={badgeVariants({ hovered: isHovered })}>—</span>

        <div className="pt-2 pb-2 pl-3">
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs text-gray-400 transition-opacity duration-150",
              isHovered ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="hover:text-gray-600"
            >
              Add note
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="hover:text-red-500"
            >
              Delete
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className="absolute left-0 right-0 group"
      style={{ top }}
      title={`Added: ${createdAtFormatted}`}
      onMouseEnter={() => onHover?.(comment.id)}
      onMouseLeave={() => onHover?.(undefined)}
    >
      <span className={badgeVariants({ hovered: isHovered })}>
        {commentIndex + 1}
      </span>

      <div
        className={cn(
          "relative border-t border-gray-100 pt-3 pb-2 pl-3 transition-all duration-200",
          confidenceVariants({
            confidence: comment.anchorConfidence || "exact",
          }),
        )}
      >
        {!isEditing && (
          <div
            className={cn(
              "font-serif",
              selectedTextVariants({ hovered: isHovered }),
            )}
          >
            <span>"{comment.selectedText}"</span>
          </div>
        )}

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
            <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-400">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="hover:text-gray-600"
              >
                Edit
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                className="hover:text-red-500"
              >
                Delete
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={handleCopy}
                className="hover:text-gray-600"
                title="Copy raw text (⌘C)"
              >
                Copy
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => onCopyForLLM(comment)}
                className="hover:text-gray-600"
                title="Copy with context for LLM (⌘⇧C)"
              >
                LLM
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
