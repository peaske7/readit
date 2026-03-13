import { useCallback, useEffect } from "react";
import { appStore, useAppStore } from "../store";
import type { Selection } from "../types";

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
  highlightPositions: Record<string, number>;
  documentPositions: Record<string, number>;
  pendingSelectionTop: number | undefined;
  onTextSelect: (
    text: string,
    startOffset: number,
    endOffset: number,
    selectionTop: number,
  ) => void;
  onPositionsChange: (
    positions: Record<string, number>,
    docPositions: Record<string, number>,
    pendingTop?: number,
  ) => void;
  clearSelection: () => void;
}

/**
 * Manage text selection state, highlight positions, and click-outside dismissal.
 * State lives in the Zustand store for tab-switch preservation.
 */
export function useTextSelection(): UseTextSelectionResult {
  const selection = useAppStore(
    (s) => s.getActiveDocumentState()?.selection ?? null,
  );
  const highlightPositions = useAppStore(
    (s) => s.getActiveDocumentState()?.highlightPositions ?? {},
  );
  const documentPositions = useAppStore(
    (s) => s.getActiveDocumentState()?.documentPositions ?? {},
  );
  const pendingSelectionTop = useAppStore(
    (s) => s.getActiveDocumentState()?.pendingSelectionTop,
  );

  useEffect(() => {
    if (!selection) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't clear if clicking inside the comment input area
      if (target.closest("[data-comment-input]")) return;

      // Don't clear if clicking on any highlight (pending or comment)
      if (target.closest("mark[data-pending]")) return;
      if (target.closest("mark[data-comment-id]")) return;

      // Clear selection state and pending marks
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

  const onPositionsChange = useCallback(
    (
      positions: Record<string, number>,
      docPositions: Record<string, number>,
      _pendingTop?: number,
    ) => {
      appStore.getState().setHighlightPositions(positions);
      appStore.getState().setDocumentPositions(docPositions);
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
    highlightPositions,
    documentPositions,
    pendingSelectionTop,
    onTextSelect,
    onPositionsChange,
    clearSelection,
  };
}
