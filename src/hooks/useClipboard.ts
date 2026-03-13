import { useCallback } from "react";
import { toast } from "sonner";
import { extractContext, formatForLLM } from "../lib/context";
import {
  exportCommentsAsJson,
  generatePrompt,
  generateRawText,
} from "../lib/export";
import { truncate } from "../lib/utils";
import type { Comment, Document, Selection } from "../types";

interface UseClipboardParams {
  comments: Comment[];
  document: Document | undefined;
  selection: Selection | undefined;
  clearSelection: () => void;
}

export function useClipboard({
  comments,
  document,
  selection,
  clearSelection,
}: UseClipboardParams) {
  // Export handlers
  const copyAll = useCallback(() => {
    if (!document) return;
    const prompt = generatePrompt(comments, document.fileName);
    navigator.clipboard.writeText(prompt);
    toast.success("Copied all comments");
  }, [comments, document]);

  const copyAllRaw = useCallback(() => {
    if (!document) return;
    const raw = generateRawText(comments);
    navigator.clipboard.writeText(raw);
    toast.success("Copied all comments as raw text");
  }, [comments, document]);

  const exportJson = useCallback(() => {
    if (!document) return;
    exportCommentsAsJson(comments, document);
  }, [comments, document]);

  // Selection copy handlers
  const copySelectionRaw = useCallback(() => {
    if (!selection) return;

    navigator.clipboard.writeText(selection.text);
    toast.success(`Copied: "${truncate(selection.text)}"`);
    clearSelection();
  }, [selection, clearSelection]);

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
    toast.success(`Copied for LLM: "${truncate(selection.text)}"`);
    clearSelection();
  }, [selection, document, clearSelection]);

  return {
    copyAll,
    copyAllRaw,
    exportJson,
    copySelectionRaw,
    copySelectionForLLM,
  };
}
