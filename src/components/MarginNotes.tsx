import { memo } from "react";
import type { Comment } from "../schema";
import { MarginNote } from "./MarginNote";

interface MarginNotesProps {
  sortedComments: Comment[];
}

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
