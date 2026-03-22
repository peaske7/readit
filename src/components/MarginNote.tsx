import { cva } from "class-variance-authority";
import { useState } from "react";
import { useCommentContext } from "../contexts/CommentContext";
import { useLayoutContext } from "../contexts/LayoutContext";
import { useLocale } from "../contexts/LocaleContext";
import { cn } from "../lib/utils";
import { type Comment, FontFamilies } from "../types";
import { InlineEditor } from "./InlineEditor";
import { ActionBar } from "./ui/ActionBar";
import { ActionLink } from "./ui/ActionLink";
import { SeparatorDot } from "./ui/SeparatorDot";

interface MarginNoteProps {
  comment: Comment;
  top: number;
  commentIndex?: number;
}

const selectedTextVariants = cva(
  "text-sm italic mb-1 line-clamp-1 flex items-center gap-1 transition-colors duration-150",
  {
    variants: {
      hovered: {
        true: "text-zinc-600 dark:text-zinc-400",
        false: "text-zinc-400 dark:text-zinc-500",
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
        true: "text-zinc-800 dark:text-zinc-200",
        false: "text-zinc-500 dark:text-zinc-400",
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
        true: "text-zinc-600 dark:text-zinc-400",
        false: "text-zinc-400 dark:text-zinc-500",
      },
    },
    defaultVariants: { hovered: false },
  },
);

export function MarginNote({
  comment,
  top,
  commentIndex = 0,
}: MarginNoteProps) {
  const { fontFamily } = useLayoutContext();
  const { t } = useLocale();
  const {
    editComment,
    deleteComment,
    copyCommentRaw,
    copyCommentForLLM,
    hoveredCommentId,
    setHoveredCommentId,
    scrollToHighlight,
  } = useCommentContext();

  const isHovered = hoveredCommentId === comment.id;
  const fontClass =
    fontFamily === FontFamilies.SANS_SERIF ? "font-sans" : "font-serif";
  const [isEditing, setIsEditing] = useState(false);

  const hasNote = comment.comment.trim().length > 0;

  const handleCopy = () => {
    copyCommentRaw(comment);
  };

  const createdAtFormatted = new Date(comment.createdAt).toLocaleString();

  // Highlight-only (no note): minimal em-dash marker
  if (!hasNote && !isEditing) {
    return (
      <article
        className="absolute left-0 right-0 group"
        style={{ top }}
        title={`Added: ${createdAtFormatted}`}
        data-comment-id={comment.id}
        onMouseEnter={() => setHoveredCommentId(comment.id)}
        onMouseLeave={() => setHoveredCommentId(undefined)}
      >
        <span className={badgeVariants({ hovered: isHovered })}>—</span>

        <div className="pt-2 pb-2 pl-3">
          <ActionBar
            className={cn("gap-1.5 duration-150", isHovered && "opacity-100")}
          >
            <ActionLink onClick={() => setIsEditing(true)}>
              {t("marginNote.addNote")}
            </ActionLink>
            <SeparatorDot />
            <ActionLink
              variant="destructive"
              onClick={() => deleteComment(comment.id)}
            >
              {t("marginNote.delete")}
            </ActionLink>
          </ActionBar>
        </div>
      </article>
    );
  }

  return (
    <article
      className="absolute left-0 right-0 group"
      style={{ top }}
      title={`Added: ${createdAtFormatted}`}
      data-comment-id={comment.id}
      onMouseEnter={() => setHoveredCommentId(comment.id)}
      onMouseLeave={() => setHoveredCommentId(undefined)}
    >
      <span className={badgeVariants({ hovered: isHovered })}>
        {commentIndex + 1}
      </span>

      <div
        className={cn(
          "relative border-t border-zinc-100 dark:border-zinc-800 pt-3 pb-2 pl-3 transition-colors duration-150",
          comment.anchorConfidence === "unresolved" && "opacity-60",
        )}
      >
        {!isEditing && (
          <div
            className={cn(
              fontClass,
              selectedTextVariants({ hovered: isHovered }),
            )}
          >
            <button
              type="button"
              onClick={() => scrollToHighlight(comment.id)}
              className="cursor-pointer hover:underline text-left"
            >
              "{comment.selectedText}"
            </button>
          </div>
        )}

        {isEditing ? (
          <InlineEditor
            initialText={comment.comment}
            onSave={(text) => {
              editComment(comment.id, text);
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <>
            <p
              className={cn(
                fontClass,
                commentTextVariants({ hovered: isHovered }),
              )}
            >
              {comment.comment}
            </p>
            <ActionBar className="gap-1.5 mt-2">
              <ActionLink onClick={() => setIsEditing(true)}>
                {t("marginNote.edit")}
              </ActionLink>
              <SeparatorDot />
              <ActionLink
                variant="destructive"
                onClick={() => deleteComment(comment.id)}
              >
                {t("marginNote.delete")}
              </ActionLink>
              <SeparatorDot />
              <ActionLink
                onClick={handleCopy}
                title={t("marginNote.copyTitle")}
              >
                {t("marginNote.copy")}
              </ActionLink>
              <SeparatorDot />
              <ActionLink
                onClick={() => copyCommentForLLM(comment)}
                title={t("marginNote.llmTitle")}
              >
                {t("marginNote.llm")}
              </ActionLink>
            </ActionBar>
          </>
        )}
      </div>
    </article>
  );
}
