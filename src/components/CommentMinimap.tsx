import { MINIMAP_HEADER_OFFSET_PX } from "../lib/layout-constants";
import { cn } from "../lib/utils";
import type { Comment } from "../types";

interface CommentMinimapProps {
  /** Comments pre-sorted by startOffset */
  sortedComments: Comment[];
  /** Absolute Y-positions from document top for each comment */
  documentPositions: Record<string, number>;
  documentHeight: number;
  viewportHeight: number;
  hoveredCommentId?: string | null;
  onCommentClick: (commentId: string) => void;
}

export function CommentMinimap({
  sortedComments,
  documentPositions,
  documentHeight,
  viewportHeight,
  hoveredCommentId,
  onCommentClick,
}: CommentMinimapProps) {
  // Don't render if no comments or document height is 0
  if (sortedComments.length === 0 || documentHeight === 0) {
    return null;
  }

  // Minimap height is the viewport height minus header
  const minimapHeight = viewportHeight - MINIMAP_HEADER_OFFSET_PX;

  return (
    <div
      className="fixed right-0 top-12 w-3 z-40"
      style={{ height: minimapHeight }}
    >
      {/* Comment position indicators */}
      {sortedComments.map((comment) => {
        const position = documentPositions[comment.id];
        if (position === undefined) return null;

        // Scale absolute position to minimap height
        const indicatorTop = (position / documentHeight) * minimapHeight;

        const isHovered = hoveredCommentId === comment.id;

        return (
          <button
            type="button"
            key={comment.id}
            className={cn(
              "absolute left-0 right-0 h-1.5 rounded-l transition-all duration-150 cursor-pointer",
              isHovered
                ? "bg-amber-500 w-4 -translate-x-1"
                : "bg-amber-500 hover:bg-amber-600 hover:w-4 hover:-translate-x-1",
            )}
            style={{
              top: Math.max(0, Math.min(indicatorTop, minimapHeight - 6)),
            }}
            onClick={() => onCommentClick(comment.id)}
            title={`"${comment.selectedText.slice(0, 30)}${comment.selectedText.length > 30 ? "..." : ""}"`}
          />
        );
      })}
    </div>
  );
}
