import { Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { useCommentContext } from "../../contexts/CommentContext";
import { useLocale } from "../../contexts/LocaleContext";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import { CommentListItem } from "./CommentListItem";

interface CommentManagerProps {
  onClose: () => void;
}

export function CommentManager({ onClose }: CommentManagerProps) {
  const { t } = useLocale();
  const { comments, copyAllForLLM, deleteAll } = useCommentContext();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
      {confirmingDelete ? (
        <div className="px-3 py-2 border-b border-zinc-100">
          <Text variant="caption" className="mb-1.5">
            {t("commentManager.deleteAllConfirm", { count: comments.length })}
          </Text>
          <div className="flex gap-3">
            <Button
              variant="link"
              size="sm"
              className="text-red-600 hover:text-red-700 h-auto p-0 text-xs"
              onClick={() => {
                deleteAll();
                onClose();
              }}
            >
              {t("commentManager.delete")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => setConfirmingDelete(false)}
            >
              {t("commentManager.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <Text
          variant="caption"
          as="div"
          className="flex items-center justify-between px-3 py-2 border-b border-zinc-100"
        >
          <span>
            {resolvedCount}
            {unresolvedCount > 0 && (
              <span>
                {" "}
                · {unresolvedCount} {t("commentManager.unresolved")}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
              onClick={copyAllForLLM}
              title={t("commentManager.copyAllTitle")}
            >
              <Copy size={13} />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-red-500 transition-colors"
              onClick={() => setConfirmingDelete(true)}
              title={t("commentManager.deleteAllTitle")}
            >
              <Trash2 size={13} />
            </button>
          </span>
        </Text>
      )}

      <div className="overflow-y-auto max-h-80">
        {sortedComments.length === 0 ? (
          <Text variant="caption" as="div" className="px-3 py-4 text-center">
            {t("commentManager.noComments")}
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
