import { useCallback, useState } from "react";

interface ReanchorTarget {
  commentId: string;
}

interface UseReanchorModeResult {
  reanchorTarget: ReanchorTarget | null;
  startReanchor: (commentId: string) => void;
  cancelReanchor: () => void;
}

/**
 * Hook for managing re-anchor mode state.
 * When active, the user can select new text to re-anchor an unresolved comment.
 */
export function useReanchorMode(): UseReanchorModeResult {
  const [reanchorTarget, setReanchorTarget] = useState<ReanchorTarget | null>(
    null,
  );

  const startReanchor = useCallback((commentId: string) => {
    setReanchorTarget({ commentId });
  }, []);

  const cancelReanchor = useCallback(() => {
    setReanchorTarget(null);
  }, []);

  return {
    reanchorTarget,
    startReanchor,
    cancelReanchor,
  };
}
