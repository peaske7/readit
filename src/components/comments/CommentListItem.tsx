import { useState } from "react";
import { useCommentContext } from "../../contexts/CommentContext";
import { useLocale } from "../../contexts/LocaleContext";
import { cn } from "../../lib/utils";
import type { Comment } from "../../types";
import { InlineEditor } from "../InlineEditor";
import { ActionBar } from "../ui/ActionBar";
import { ActionLink } from "../ui/ActionLink";
import { Text } from "../ui/Text";

interface CommentListItemProps {
  comment: Comment;
  /** Called after navigation actions (Go to, Re-anchor) to close parent dropdown */
  onAction?: () => void;
}

export function CommentListItem({ comment, onAction }: CommentListItemProps) {
  const { t } = useLocale();
  const { editComment, deleteComment, navigateToComment, startReanchor } =
    useCommentContext();

  const [isEditing, setIsEditing] = useState(false);

  const isUnresolved = comment.anchorConfidence === "unresolved";
  const canGoTo = !isUnresolved;

  const handleGoTo = () => {
    navigateToComment(comment.id);
    onAction?.();
  };

  const handleReanchor = () => {
    startReanchor(comment.id);
    onAction?.();
  };

  return (
    <div
      className={cn(
        "group px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0",
        isUnresolved && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Text variant="caption" asChild>
          <span className="italic line-clamp-1">"{comment.selectedText}"</span>
        </Text>
        {isUnresolved && (
          <Text variant="caption" asChild>
            <span className="shrink-0">· {t("commentList.unresolved")}</span>
          </Text>
        )}
      </div>

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
          <Text variant="body" asChild>
            <p className="line-clamp-2">{comment.comment}</p>
          </Text>

          <ActionBar className="gap-3 mt-1.5">
            <ActionLink onClick={() => setIsEditing(true)}>
              {t("commentList.edit")}
            </ActionLink>
            <ActionLink onClick={() => deleteComment(comment.id)}>
              {t("commentList.delete")}
            </ActionLink>
            {canGoTo && (
              <ActionLink onClick={handleGoTo}>
                {t("commentList.goTo")}
              </ActionLink>
            )}
            {isUnresolved && (
              <ActionLink onClick={handleReanchor}>
                {t("commentList.reanchor")}
              </ActionLink>
            )}
          </ActionBar>
        </>
      )}
    </div>
  );
}
