import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment } from "../schema";
import { uiStore } from "../store";

export type SetFocusedFn = (commentId: string | undefined) => void;
export type ScrollToCommentFn = (commentId: string) => void;

interface UseCommentNavigationResult {
  currentIndex: number;
  setHoveredCommentId: (id: string | undefined) => void;
  navigateToComment: (commentId: string) => void;
  navigatePrevious: () => void;
  navigateNext: () => void;
  registerHighlighter: (
    setFocused: SetFocusedFn,
    scrollToComment: ScrollToCommentFn,
  ) => void;
}

export function useCommentNavigation(
  sortedComments: Comment[],
): UseCommentNavigationResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const sortedRef = useRef(sortedComments);
  sortedRef.current = sortedComments;

  const setFocusedRef = useRef<SetFocusedFn | undefined>(undefined);
  const scrollToCommentRef = useRef<ScrollToCommentFn | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(hoverTimeoutRef.current);
  }, []);

  const clampedIndex =
    sortedComments.length === 0
      ? 0
      : Math.min(currentIndex, sortedComments.length - 1);
  if (clampedIndex !== currentIndex) {
    setCurrentIndex(clampedIndex);
  }

  const setHoveredCommentId = useCallback((id: string | undefined) => {
    uiStore.setState({ hoveredCommentId: id });
    setFocusedRef.current?.(id);
  }, []);

  const navigateToComment = useCallback(
    (commentId: string) => {
      scrollToCommentRef.current?.(commentId);

      setHoveredCommentId(commentId);
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(
        () => setHoveredCommentId(undefined),
        1500,
      );
    },
    [setHoveredCommentId],
  );

  const navigatePrevious = useCallback(() => {
    const sc = sortedRef.current;
    if (sc.length === 0) return;
    setCurrentIndex((prev) => {
      const newIndex = prev === 0 ? sc.length - 1 : prev - 1;
      navigateToComment(sc[newIndex].id);
      return newIndex;
    });
  }, [navigateToComment]);

  const navigateNext = useCallback(() => {
    const sc = sortedRef.current;
    if (sc.length === 0) return;
    setCurrentIndex((prev) => {
      const newIndex = prev === sc.length - 1 ? 0 : prev + 1;
      navigateToComment(sc[newIndex].id);
      return newIndex;
    });
  }, [navigateToComment]);

  const registerHighlighter = useCallback(
    (setFocused: SetFocusedFn, scrollToComment: ScrollToCommentFn) => {
      setFocusedRef.current = setFocused;
      scrollToCommentRef.current = scrollToComment;
    },
    [],
  );

  return {
    currentIndex: clampedIndex,
    setHoveredCommentId,
    navigateToComment,
    navigatePrevious,
    navigateNext,
    registerHighlighter,
  };
}
