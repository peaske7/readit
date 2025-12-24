import { useCallback, useEffect, useState } from "react";
import type { Comment } from "../types";

interface UseCommentNavigationResult {
  currentIndex: number;
  hoveredCommentId: string | undefined;
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
  const [hoveredCommentId, setHoveredCommentId] = useState<
    string | undefined
  >();

  // Reset comment index when comments change
  useEffect(() => {
    if (currentIndex >= sortedComments.length) {
      setCurrentIndex(Math.max(0, sortedComments.length - 1));
    }
  }, [sortedComments.length, currentIndex]);

  // Navigate to a comment by scrolling its highlight into view
  const navigateToComment = useCallback((commentId: string) => {
    const selector = `mark[data-comment-id="${commentId}"]`;

    const scrollAndHighlight = (element: Element) => {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      setHoveredCommentId(commentId);
      setTimeout(() => setHoveredCommentId(undefined), 1500);
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
  }, []);

  // Navigate to previous comment (cycles to last when at first)
  const navigatePrevious = useCallback(() => {
    if (sortedComments.length === 0) return;
    const newIndex =
      currentIndex === 0 ? sortedComments.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    navigateToComment(sortedComments[newIndex].id);
  }, [currentIndex, sortedComments, navigateToComment]);

  // Navigate to next comment (cycles to first when at last)
  const navigateNext = useCallback(() => {
    if (sortedComments.length === 0) return;
    const newIndex =
      currentIndex === sortedComments.length - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
    navigateToComment(sortedComments[newIndex].id);
  }, [currentIndex, sortedComments, navigateToComment]);

  // Keyboard navigation: Alt+↑/↓
  useEffect(() => {
    if (sortedComments.length <= 1) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" && e.altKey) {
        e.preventDefault();
        navigatePrevious();
      }
      if (e.key === "ArrowDown" && e.altKey) {
        e.preventDefault();
        navigateNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sortedComments.length, navigatePrevious, navigateNext]);

  return {
    currentIndex,
    hoveredCommentId,
    setHoveredCommentId,
    navigateToComment,
    navigatePrevious,
    navigateNext,
  };
}
