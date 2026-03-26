import { memo, useCallback, useState } from "react";
import { useCommentActions } from "../contexts/CommentContext";
import { useLocale } from "../contexts/LocaleContext";
import { usePositions } from "../contexts/PositionsContext";
import { useSettings } from "../contexts/SettingsContext";
import { cn } from "../lib/utils";
import { useUI } from "../store";
import { type Comment, FontFamilies } from "../types";
import { InlineEditor } from "./InlineEditor";
import { ActionBar } from "./ui/ActionBar";
import { ActionLink } from "./ui/ActionLink";
import { SeparatorDot } from "./ui/SeparatorDot";

interface MarginNoteProps {
  comment: Comment;
  commentIndex?: number;
}

function selectedTextClass(hovered: boolean) {
  return cn(
    "text-sm italic mb-1 line-clamp-1 flex items-center gap-1 transition-colors duration-150",
    hovered
      ? "text-zinc-600 dark:text-zinc-400"
      : "text-zinc-400 dark:text-zinc-500",
  );
}

function commentTextClass(hovered: boolean) {
  return cn(
    "text-sm whitespace-pre-wrap transition-colors duration-150",
    hovered
      ? "text-zinc-800 dark:text-zinc-200"
      : "text-zinc-500 dark:text-zinc-400",
  );
}

function badgeClass(hovered: boolean) {
  return cn(
    "absolute -left-4 top-2 text-xs tabular-nums transition-colors duration-150",
    hovered
      ? "text-zinc-600 dark:text-zinc-400"
      : "text-zinc-400 dark:text-zinc-500",
  );
}

export const MarginNote = memo(function MarginNote({
  comment,
  commentIndex = 0,
}: MarginNoteProps) {
  const { fontFamily } = useSettings();
  const { t } = useLocale();
  const {
    editComment,
    deleteComment,
    copyCommentRaw,
    copyCommentForLLM,
    setHoveredCommentId,
    scrollToHighlight,
  } = useCommentActions();

  const pos = usePositions();
  const refCallback = useCallback(
    (el: HTMLElement | null) => {
      if (el) pos.register(comment.id, el);
      else pos.unregister(comment.id);
    },
    [pos, comment.id],
  );

  const isHovered = useUI((s) => s.hoveredCommentId === comment.id);
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
        ref={refCallback}
        className="absolute left-0 right-0 group"
        style={{
          visibility: "hidden",
          contentVisibility: "auto",
          containIntrinsicSize: "auto 80px",
        }}
        title={`Added: ${createdAtFormatted}`}
        data-comment-id={comment.id}
        onMouseEnter={() => setHoveredCommentId(comment.id)}
        onMouseLeave={() => setHoveredCommentId(undefined)}
      >
        <span className={badgeClass(isHovered)}>—</span>

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
      ref={refCallback}
      className="absolute left-0 right-0 group"
      style={{ visibility: "hidden" }}
      title={`Added: ${createdAtFormatted}`}
      data-comment-id={comment.id}
      onMouseEnter={() => setHoveredCommentId(comment.id)}
      onMouseLeave={() => setHoveredCommentId(undefined)}
    >
      <span className={badgeClass(isHovered)}>{commentIndex + 1}</span>

      <div
        className={cn(
          "relative border-t border-zinc-100 dark:border-zinc-800 pt-3 pb-2 pl-3 transition-colors duration-150",
          comment.anchorConfidence === "unresolved" && "opacity-60",
        )}
      >
        {!isEditing && (
          <div className={cn(fontClass, selectedTextClass(isHovered))}>
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
            <p className={cn(fontClass, commentTextClass(isHovered))}>
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
});
