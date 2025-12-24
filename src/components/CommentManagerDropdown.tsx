import type { Comment } from "../types";
import { CommentListItem } from "./CommentListItem";

interface CommentManagerDropdownProps {
  comments: Comment[];
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
  onGoTo: (id: string) => void;
  onReanchor?: (id: string) => void;
  onClose: () => void;
}

export function CommentManagerDropdown({
  comments,
  onEdit,
  onDelete,
  onGoTo,
  onReanchor,
  onClose,
}: CommentManagerDropdownProps) {
  const unresolvedCount = comments.filter(
    (c) => c.anchorConfidence === "unresolved",
  ).length;
  const resolvedCount = comments.length - unresolvedCount;

  // Sort: resolved first, then unresolved
  const sortedComments = [...comments].sort((a, b) => {
    const aUnresolved = a.anchorConfidence === "unresolved";
    const bUnresolved = b.anchorConfidence === "unresolved";
    if (aUnresolved === bUnresolved) return 0;
    return aUnresolved ? 1 : -1;
  });

  const handleGoTo = (id: string) => {
    onGoTo(id);
    onClose();
  };

  const handleReanchor = (id: string) => {
    onReanchor?.(id);
    onClose();
  };

  return (
    <div
      className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg shadow-gray-200/50 border border-gray-100 w-80 max-h-96 overflow-hidden animate-in"
      role="dialog"
      aria-label="Comment manager"
    >
      {/* Summary header */}
      <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-400">
        {resolvedCount}
        {unresolvedCount > 0 && <span> · {unresolvedCount} unresolved</span>}
      </div>

      {/* Scrollable comment list */}
      <div className="overflow-y-auto max-h-80">
        {sortedComments.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">
            No comments yet
          </div>
        ) : (
          sortedComments.map((comment) => (
            <CommentListItem
              key={comment.id}
              comment={comment}
              onEdit={onEdit}
              onDelete={onDelete}
              onGoTo={handleGoTo}
              onReanchor={onReanchor ? handleReanchor : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}
