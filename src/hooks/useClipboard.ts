import { useCallback, useEffect, useRef } from "react";
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

  // Keyboard shortcuts: Cmd+C for raw copy, Cmd+Shift+C for LLM copy, Escape to cancel
  // Use refs to avoid re-attaching listeners on every selection/callback change
  const selectionRef = useRef(selection);
  const copyRawRef = useRef(copySelectionRaw);
  const copyLLMRef = useRef(copySelectionForLLM);
  const clearRef = useRef(clearSelection);

  selectionRef.current = selection;
  copyRawRef.current = copySelectionRaw;
  copyLLMRef.current = copySelectionForLLM;
  clearRef.current = clearSelection;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectionRef.current) return;

      if (e.key === "c" && e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) {
          copyLLMRef.current();
        } else {
          copyRawRef.current();
        }
      }
      if (e.key === "Escape") {
        clearRef.current();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    copyAll,
    copyAllRaw,
    exportJson,
    copySelectionRaw,
    copySelectionForLLM,
  };
}
