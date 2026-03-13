import { useCommentContext } from "../../contexts/CommentContext";
import { Text } from "../ui/Text";
import { CommentListItem } from "./CommentListItem";

interface CommentManagerProps {
  onClose: () => void;
}

export function CommentManager({ onClose }: CommentManagerProps) {
  const { comments } = useCommentContext();

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

  return (
    <>
      <Text variant="caption" asChild>
        <div className="px-3 py-2 border-b border-zinc-100">
          {resolvedCount}
          {unresolvedCount > 0 && <span> · {unresolvedCount} unresolved</span>}
        </div>
      </Text>

      <div className="overflow-y-auto max-h-80">
        {sortedComments.length === 0 ? (
          <Text variant="caption" asChild>
            <div className="px-3 py-4 text-center">No comments yet</div>
          </Text>
        ) : (
          sortedComments.map((comment) => (
            <CommentListItem
              key={comment.id}
              comment={comment}
              onAction={onClose}
            />
          ))
        )}
      </div>
    </>
  );
}
