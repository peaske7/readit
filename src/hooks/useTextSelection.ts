import { useCallback, useEffect } from "react";
import type { Selection } from "../schema";
import { appStore, useAppStore } from "../store";

function clearPendingHighlight() {
  if (typeof CSS !== "undefined" && CSS.highlights) {
    CSS.highlights.delete("pending-selection");
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

      appStore.getState().setSelection(null);
      appStore.getState().setPendingSelectionTop(undefined);
      clearPendingHighlight();
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (sel?.isCollapsed) {
          sel.removeAllRanges();
        }
      });
    };

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
    clearPendingHighlight();
    window.getSelection()?.removeAllRanges();
  }, []);

  return {
    selection,
    pendingSelectionTop,
    onTextSelect,
    clearSelection,
  };
}
