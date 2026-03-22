import { useCallback } from "react";
import { toast } from "sonner";
import { extractContext, formatForLLM } from "../lib/context";
import {
  exportCommentsAsJson,
  generatePrompt,
  generateRawText,
} from "../lib/export";
import type { TranslationKey } from "../lib/i18n";
import { truncate } from "../lib/utils";
import type { Comment, Document, Selection } from "../types";

interface UseClipboardParams {
  comments: Comment[];
  document: Document | undefined;
  selection: Selection | undefined;
  clearSelection: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export function useClipboard({
  comments,
  document,
  selection,
  clearSelection,
  t,
}: UseClipboardParams) {
  // Export handlers
  const copyAll = useCallback(() => {
    if (!document) return;
    const prompt = generatePrompt(comments, document.fileName);
    navigator.clipboard.writeText(prompt);
    toast.success(t("toast.copiedAllComments"));
  }, [comments, document, t]);

  const copyAllRaw = useCallback(() => {
    if (!document) return;
    const raw = generateRawText(comments);
    navigator.clipboard.writeText(raw);
    toast.success(t("toast.copiedAllRaw"));
  }, [comments, document, t]);

  const exportJson = useCallback(() => {
    if (!document) return;
    exportCommentsAsJson(comments, document);
  }, [comments, document]);

  // Selection copy handlers
  const copySelectionRaw = useCallback(() => {
    if (!selection) return;

    navigator.clipboard.writeText(selection.text);
    toast.success(t("toast.copied", { text: truncate(selection.text) }));
    clearSelection();
  }, [selection, clearSelection, t]);

  const copySelectionForLLM = useCallback(() => {
    if (!selection || !document) return;

    const context = extractContext({
      content: document.content,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
    });
    const formatted = formatForLLM({
      context,
      fileName: document.fileName,
    });

    navigator.clipboard.writeText(formatted);
    toast.success(t("toast.copiedForLLM", { text: truncate(selection.text) }));
    clearSelection();
  }, [selection, document, clearSelection, t]);

  return {
    copyAll,
    copyAllRaw,
    exportJson,
    copySelectionRaw,
    copySelectionForLLM,
  };
}
