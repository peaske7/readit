import { useCallback } from "react";
import { toast } from "sonner";
import { exportCommentsAsJson, generatePrompt } from "../lib/export";
import type { TranslationKey } from "../lib/i18n";
import type { Comment, Document } from "../types";

interface UseClipboardParams {
  comments: Comment[];
  document: Document | undefined;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export function useClipboard({ comments, document, t }: UseClipboardParams) {
  const copyAll = useCallback(() => {
    if (!document) return;
    const text = generatePrompt(comments, document.fileName);
    navigator.clipboard.writeText(text);
    toast.success(t("toast.copiedAllComments"));
  }, [comments, document, t]);

  const exportJson = useCallback(() => {
    if (!document) return;
    exportCommentsAsJson(comments, document);
  }, [comments, document]);

  return { copyAll, exportJson };
}
