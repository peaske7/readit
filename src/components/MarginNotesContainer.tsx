import { useMemo } from "react";
import { resolveMarginNotePositions } from "../lib/margin-layout";
import type { Comment, FontFamily } from "../types";
import { MarginNote } from "./MarginNote";

interface MarginNotesContainerProps {
  /** Comments pre-sorted by startOffset */
  sortedComments: Comment[];
  highlightPositions: Record<string, number>;
  onEditComment: (id: string, newText: string) => void;
  onDeleteComment: (id: string) => void;
  onCopyCommentRaw: (comment: Comment) => void;
  onCopyCommentForLLM: (comment: Comment) => void;
  pendingSelectionTop?: number;
  hoveredCommentId?: string;
  /** Callback when hovering over a margin note */
  onHoverComment?: (commentId: string | undefined) => void;
  /** Callback when clicking quoted text to scroll to highlight */
  onScrollToHighlight?: (commentId: string) => void;
  fontFamily?: FontFamily;
}

export function MarginNotesContainer({
  sortedComments,
  highlightPositions,
  onEditComment,
  onDeleteComment,
  onCopyCommentRaw,
  onCopyCommentForLLM,
  pendingSelectionTop,
  hoveredCommentId,
  onHoverComment,
  onScrollToHighlight,
  fontFamily,
}: MarginNotesContainerProps) {
  // Calculate resolved positions (avoiding overlaps with input and other notes)
  const resolvedPositions = useMemo(
    () =>
      resolveMarginNotePositions(
        sortedComments.map((c) => c.id),
        highlightPositions,
        pendingSelectionTop,
      ),
    [sortedComments, highlightPositions, pendingSelectionTop],
  );

  if (sortedComments.length === 0) {
    return null;
  }

  return (
    <div className="relative w-64">
      {/* Margin notes */}
      {sortedComments.map((comment, index) => {
        const top = resolvedPositions.get(comment.id);
        if (top === undefined) return null;

        return (
          <MarginNote
            key={comment.id}
            comment={comment}
            top={top}
            isHovered={hoveredCommentId === comment.id}
            commentIndex={index}
            onEdit={onEditComment}
            onDelete={onDeleteComment}
            onCopyRaw={onCopyCommentRaw}
            onCopyForLLM={onCopyCommentForLLM}
            onHover={onHoverComment}
            onScrollToHighlight={onScrollToHighlight}
            fontFamily={fontFamily}
          />
        );
      })}
    </div>
  );
}
