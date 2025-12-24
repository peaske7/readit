import { useCallback, useEffect, useState } from "react";
import type { Selection } from "../types";

interface UseTextSelectionResult {
  selection: Selection | null;
  highlightPositions: Record<string, number>;
  documentPositions: Record<string, number>;
  pendingSelectionTop: number | undefined;
  onTextSelect: (text: string, startOffset: number, endOffset: number) => void;
  onPositionsChange: (
    positions: Record<string, number>,
    docPositions: Record<string, number>,
    pendingTop?: number,
  ) => void;
  clearSelection: () => void;
}

/**
 * Manage text selection state, highlight positions, and click-outside dismissal.
 */
export function useTextSelection(): UseTextSelectionResult {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [highlightPositions, setHighlightPositions] = useState<
    Record<string, number>
  >({});
  const [documentPositions, setDocumentPositions] = useState<
    Record<string, number>
  >({});
  const [pendingSelectionTop, setPendingSelectionTop] = useState<
    number | undefined
  >();

  // Clear selection when clicking outside
  useEffect(() => {
    if (!selection) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't clear if clicking inside the comment input area
      if (target.closest("[data-comment-input]")) return;

      // Don't clear if clicking on any highlight (pending or comment)
      if (target.closest("mark[data-pending]")) return;
      if (target.closest("mark[data-comment-id]")) return;

      // Clear selection
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    };

    // Use mousedown to catch clicks before text selection
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selection]);

  const onTextSelect = useCallback(
    (text: string, startOffset: number, endOffset: number) => {
      setSelection({ text, startOffset, endOffset });
    },
    [],
  );

  const onPositionsChange = useCallback(
    (
      positions: Record<string, number>,
      docPositions: Record<string, number>,
      pendingTop?: number,
    ) => {
      setHighlightPositions(positions);
      setDocumentPositions(docPositions);
      setPendingSelectionTop(pendingTop);
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelection(null);
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
