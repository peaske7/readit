import { useMemo } from "react";
import {
  COMMENT_INPUT_HEIGHT_PX,
  MARGIN_NOTE_MIN_GAP_PX,
} from "../lib/layout-constants";
import type { Comment } from "../types";
import { MarginNote } from "./MarginNote";

interface HighlightPosition {
  commentId: string;
  top: number;
}

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
}: MarginNotesContainerProps) {
  // Calculate resolved positions (avoiding overlaps with input and other notes)
  const resolvedPositions = useMemo(() => {
    // Only include comments with known positions (avoids jolt to position 0)
    const positions: HighlightPosition[] = sortedComments
      .filter((comment) => comment.id in highlightPositions)
      .map((comment) => ({
        commentId: comment.id,
        top: highlightPositions[comment.id],
      }));

    // Sort by top position
    positions.sort((a, b) => a.top - b.top);

    // Handle input zone collision - check visual overlap, not just top position
    if (pendingSelectionTop !== null && pendingSelectionTop !== undefined) {
      const inputStart = pendingSelectionTop;
      const inputEnd = pendingSelectionTop + COMMENT_INPUT_HEIGHT_PX;

      for (const pos of positions) {
        const noteBottom = pos.top + MARGIN_NOTE_MIN_GAP_PX;

        // Check if note visually overlaps with input zone
        const overlaps = noteBottom > inputStart && pos.top < inputEnd;

        if (overlaps) {
          if (pos.top < inputStart) {
            // Note is above input but overlaps - push UP
            pos.top = Math.max(0, inputStart - MARGIN_NOTE_MIN_GAP_PX);
          } else {
            // Note is within/below input zone - push DOWN
            pos.top = inputEnd;
          }
        }
      }
      // Re-sort after potential position changes
      positions.sort((a, b) => a.top - b.top);
    }

    // Resolve note-to-note overlaps
    const inputStartForOverlap = pendingSelectionTop ?? Infinity;
    const inputEndForOverlap =
      pendingSelectionTop != null
        ? pendingSelectionTop + COMMENT_INPUT_HEIGHT_PX
        : Infinity;

    // Pass 1: Notes ABOVE input - resolve by pushing UP (bottom to top)
    for (let i = positions.length - 2; i >= 0; i--) {
      const curr = positions[i];
      const next = positions[i + 1];
      // Only process if next note is above the input zone
      if (next.top >= inputStartForOverlap) continue;
      if (next.top - curr.top < MARGIN_NOTE_MIN_GAP_PX) {
        curr.top = Math.max(0, next.top - MARGIN_NOTE_MIN_GAP_PX);
      }
    }

    // Pass 2: Notes at/below input - resolve by pushing DOWN (top to bottom)
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      if (curr.top - prev.top < MARGIN_NOTE_MIN_GAP_PX) {
        let newTop = prev.top + MARGIN_NOTE_MIN_GAP_PX;
        // If new position lands in input zone, skip to below input
        if (newTop >= inputStartForOverlap && newTop < inputEndForOverlap) {
          newTop = inputEndForOverlap;
        }
        curr.top = newTop;
      }
    }

    return new Map(positions.map((p) => [p.commentId, p.top]));
  }, [sortedComments, highlightPositions, pendingSelectionTop]);

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
          />
        );
      })}
    </div>
  );
}
