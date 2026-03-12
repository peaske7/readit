import { useMemo } from "react";
import { resolveMarginNotePositions } from "../lib/margin-layout";
import type { Comment } from "../types";
import { MarginNote } from "./MarginNote";

interface MarginNotesProps {
  /** Comments pre-sorted by startOffset */
  sortedComments: Comment[];
  highlightPositions: Record<string, number>;
  pendingSelectionTop?: number;
}

export function MarginNotes({
  sortedComments,
  highlightPositions,
  pendingSelectionTop,
}: MarginNotesProps) {
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
      {sortedComments.map((comment, index) => {
        const top = resolvedPositions.get(comment.id);
        if (top === undefined) return null;

        return (
          <MarginNote
            key={comment.id}
            comment={comment}
            top={top}
            commentIndex={index}
          />
        );
      })}
    </div>
  );
}
