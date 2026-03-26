import { memo } from "react";
import type { Comment } from "../types";
import { MarginNote } from "./MarginNote";

interface MarginNotesProps {
  /** Comments pre-sorted by startOffset */
  sortedComments: Comment[];
}

/**
 * Renders margin notes for all comments.
 * Positioning is handled entirely by PositionEngine — this component
 * only owns the content (comment text, actions). Zero position state in React.
 */
export const MarginNotes = memo(function MarginNotes({
  sortedComments,
}: MarginNotesProps) {
  if (sortedComments.length === 0) {
    return null;
  }

  return (
    <div className="relative w-64">
      {sortedComments.map((comment, index) => (
        <MarginNote key={comment.id} comment={comment} commentIndex={index} />
      ))}
    </div>
  );
});
