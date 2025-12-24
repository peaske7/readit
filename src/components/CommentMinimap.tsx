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
  scrollTop: number;
  hoveredCommentId?: string | null;
  onCommentClick: (commentId: string) => void;
}

export function CommentMinimap({
  sortedComments,
  documentPositions,
  documentHeight,
  viewportHeight,
  scrollTop,
  hoveredCommentId,
  onCommentClick,
}: CommentMinimapProps) {
  // Don't render if no comments or document height is 0
  if (sortedComments.length === 0 || documentHeight === 0) {
    return null;
  }

  // Minimap height is the viewport height minus header
  const minimapHeight = viewportHeight - MINIMAP_HEADER_OFFSET_PX;

  // Calculate viewport indicator position and size
  const viewportRatio = viewportHeight / documentHeight;
  const viewportIndicatorHeight = Math.max(
    16,
    Math.min(minimapHeight * viewportRatio, minimapHeight),
  );
  const viewportIndicatorTop = (scrollTop / documentHeight) * minimapHeight;

  return (
    <div
      className="fixed right-0 top-12 w-2 opacity-40 hover:opacity-100 transition-opacity duration-300 group z-40"
      style={{ height: minimapHeight }}
    >
      {/* Track background - only visible on hover */}
      <div className="absolute inset-0 bg-gray-200/0 group-hover:bg-gray-200/50 rounded-l transition-colors duration-300" />

      {/* Viewport indicator */}
      <div
        className="absolute left-0 right-0 bg-gray-400/30 group-hover:bg-gray-400/50 rounded-l transition-colors duration-300"
        style={{
          top: Math.min(
            viewportIndicatorTop,
            minimapHeight - viewportIndicatorHeight,
          ),
          height: viewportIndicatorHeight,
        }}
      />

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
              "absolute left-0 right-0 h-1 rounded-l transition-all duration-150 cursor-pointer",
              isHovered
                ? "bg-amber-500 w-3 -translate-x-1"
                : "bg-amber-400/80 hover:bg-amber-500 hover:w-3 hover:-translate-x-1",
            )}
            style={{
              top: Math.max(0, Math.min(indicatorTop, minimapHeight - 4)),
            }}
            onClick={() => onCommentClick(comment.id)}
            title={`"${comment.selectedText.slice(0, 30)}${comment.selectedText.length > 30 ? "..." : ""}"`}
          />
        );
      })}
    </div>
  );
}
