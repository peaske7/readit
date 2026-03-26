import { useCallback, useEffect } from "react";
import type { Selection } from "../schema";
import { appStore, useAppStore } from "../store";

/** Remove pending highlight marks from the DOM without triggering a full clear/reapply cycle. */
function clearPendingMarks() {
  for (const mark of document.querySelectorAll("mark[data-pending]")) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
  }
}

interface UseTextSelectionResult {
  selection: Selection | null;
  pendingSelectionTop: number | undefined;
  onTextSelect: (
    text: string,
    startOffset: number,
    endOffset: number,
    selectionTop: number,
  ) => void;
  clearSelection: () => void;
}

export function useTextSelection(): UseTextSelectionResult {
  const selection = useAppStore(
    (s) => s.getActiveDocumentState()?.selection ?? null,
  );
  const pendingSelectionTop = useAppStore(
    (s) => s.getActiveDocumentState()?.pendingSelectionTop,
  );

  useEffect(() => {
    if (!selection) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-comment-input]")) return;
      if (target.closest("mark[data-pending]")) return;
      if (target.closest("mark[data-comment-id]")) return;

      appStore.getState().setSelection(null);
      appStore.getState().setPendingSelectionTop(undefined);
      clearPendingMarks();
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (sel?.isCollapsed) {
          sel.removeAllRanges();
        }
      });
    };

    // Use mousedown to catch clicks before text selection
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selection]);

  const onTextSelect = useCallback(
    (
      text: string,
      startOffset: number,
      endOffset: number,
      selectionTop: number,
    ) => {
      appStore.getState().setSelection({ text, startOffset, endOffset });
      appStore.getState().setPendingSelectionTop(selectionTop);
    },
    [],
  );

  const clearSelection = useCallback(() => {
    appStore.getState().setSelection(null);
    appStore.getState().setPendingSelectionTop(undefined);
    clearPendingMarks();
    window.getSelection()?.removeAllRanges();
  }, []);

  return {
    selection,
    pendingSelectionTop,
    onTextSelect,
    clearSelection,
  };
}
