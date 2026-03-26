import { useCallback, useEffect, useRef, useState } from "react";
import { volatileStore } from "../store";
import type { Comment } from "../types";

interface UseCommentNavigationResult {
  currentIndex: number;
  setHoveredCommentId: (id: string | undefined) => void;
  navigateToComment: (commentId: string) => void;
  navigatePrevious: () => void;
  navigateNext: () => void;
}

/**
 * Manage comment navigation with cycling, keyboard shortcuts, and scroll-to-comment.
 * Handles Alt+↑/↓ keyboard navigation.
 */
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

  // Cleanup hover timeout on unmount
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

  // Update DOM data-focused attributes imperatively
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
      volatileStore.setState({ hoveredCommentId: id });
      updateFocusedMarks(id);
    },
    [updateFocusedMarks],
  );

  // Navigate to a comment by scrolling its highlight into view
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

      // Try main document first (for markdown)
      const mainHighlight = document.querySelector(selector);
      if (mainHighlight) {
        scrollAndHighlight(mainHighlight);
        return;
      }

      // Try inside iframe (for HTML content)
      const iframe = document.querySelector("iframe");
      const iframeHighlight = iframe?.contentDocument?.querySelector(selector);
      if (iframeHighlight) {
        scrollAndHighlight(iframeHighlight);
      }
    },
    [setHoveredCommentId],
  );

  // Navigate to previous comment (cycles to last when at first)
  const navigatePrevious = useCallback(() => {
    const sc = sortedRef.current;
    if (sc.length === 0) return;
    setCurrentIndex((prev) => {
      const newIndex = prev === 0 ? sc.length - 1 : prev - 1;
      navigateToComment(sc[newIndex].id);
      return newIndex;
    });
  }, [navigateToComment]);

  // Navigate to next comment (cycles to first when at last)
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
