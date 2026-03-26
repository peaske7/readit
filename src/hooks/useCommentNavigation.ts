import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment } from "../schema";
import { uiStore } from "../store";

interface UseCommentNavigationResult {
  currentIndex: number;
  setHoveredCommentId: (id: string | undefined) => void;
  navigateToComment: (commentId: string) => void;
  navigatePrevious: () => void;
  navigateNext: () => void;
}

export function useCommentNavigation(
  sortedComments: Comment[],
): UseCommentNavigationResult {
  const [currentIndex, setCurrentIndex] = useState(0);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Keep a ref to sortedComments so navigation callbacks stay stable
  const sortedRef = useRef(sortedComments);
  sortedRef.current = sortedComments;

  useEffect(() => {
    return () => clearTimeout(hoverTimeoutRef.current);
  }, []);

  // Clamp index when comments are removed (derived during render, no effect needed)
  const clampedIndex =
    sortedComments.length === 0
      ? 0
      : Math.min(currentIndex, sortedComments.length - 1);
  if (clampedIndex !== currentIndex) {
    setCurrentIndex(clampedIndex);
  }

  const updateFocusedMarks = useCallback((commentId: string | undefined) => {
    const marks = window.document.querySelectorAll("mark[data-comment-id]");
    for (const mark of marks) {
      const id = mark.getAttribute("data-comment-id");
      if (id === commentId) {
        mark.setAttribute("data-focused", "true");
      } else {
        mark.removeAttribute("data-focused");
      }
    }
  }, []);

  const setHoveredCommentId = useCallback(
    (id: string | undefined) => {
      uiStore.setState({ hoveredCommentId: id });
      updateFocusedMarks(id);
    },
    [updateFocusedMarks],
  );

  const navigateToComment = useCallback(
    (commentId: string) => {
      const selector = `mark[data-comment-id="${commentId}"]`;

      const scrollAndHighlight = (element: Element) => {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        setHoveredCommentId(commentId);
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(
          () => setHoveredCommentId(undefined),
          1500,
        );
      };

      const highlight = document.querySelector(selector);
      if (highlight) {
        scrollAndHighlight(highlight);
      }
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

  return {
    currentIndex: clampedIndex,
    setHoveredCommentId,
    navigateToComment,
    navigatePrevious,
    navigateNext,
  };
}
