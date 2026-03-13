import { useCallback } from "react";
import { appStore, useAppStore } from "../store";

interface UseReanchorModeResult {
  reanchorTarget: { commentId: string } | null;
  startReanchor: (commentId: string) => void;
  cancelReanchor: () => void;
}

/**
 * Hook for managing re-anchor mode state.
 * When active, the user can select new text to re-anchor an unresolved comment.
 * State lives in the Zustand store for tab-switch preservation.
 */
export function useReanchorMode(): UseReanchorModeResult {
  const reanchorTarget = useAppStore(
    (s) => s.getActiveDocumentState()?.reanchorTarget ?? null,
  );

  const startReanchor = useCallback((commentId: string) => {
    appStore.getState().setReanchorTarget({ commentId });
  }, []);

  const cancelReanchor = useCallback(() => {
    appStore.getState().setReanchorTarget(null);
  }, []);

  return {
    reanchorTarget,
    startReanchor,
    cancelReanchor,
  };
}
