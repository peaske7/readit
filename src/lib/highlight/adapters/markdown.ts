import { findTextPosition } from "../core";
import {
  applyHighlightToRange,
  applyHighlightWithStyle,
  clearHighlights,
  collectHighlightPositions,
  getDOMTextContent,
  getTextOffset,
} from "../dom";
import type { HighlightComment, HighlightPositions, TextRange } from "../types";
import type {
  HighlightAdapter,
  HoverHandler,
  PositionChangeHandler,
  SelectionHandler,
} from "./types";

export interface MarkdownAdapterOptions {
  /** Root element containing the markdown content */
  root: HTMLElement;
  /** Container element for position calculations */
  container: HTMLElement;
  /** Callback when user selects text */
  onSelect: SelectionHandler;
}

export function createMarkdownAdapter(
  options: MarkdownAdapterOptions,
): HighlightAdapter {
  const { root, container, onSelect } = options;

  let positionCallback: PositionChangeHandler | undefined;
  let hoverCallback: HoverHandler | undefined;

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    // Normalize whitespace: collapse any sequence of whitespace containing newlines
    // Browser's selection.toString() includes CSS margins as extra newlines/spaces
    const text = selection
      .toString()
      .trim()
      .replace(/\r?\n\s*/g, "\n");
    if (text.length === 0) return;

    const range = selection.getRangeAt(0);
    const startOffset = getTextOffset(
      root,
      range.startContainer,
      range.startOffset,
    );
    const endOffset = getTextOffset(root, range.endContainer, range.endOffset);

    onSelect(text, startOffset, endOffset);
  };

  const handleMouseOver = (e: Event) => {
    if (!hoverCallback) return;
    const target = e.target as HTMLElement;
    const mark = target.closest("mark[data-comment-id]");
    if (mark) {
      // Normalize null from DOM API to undefined
      hoverCallback(mark.getAttribute("data-comment-id") ?? undefined);
    }
  };

  const handleMouseOut = (e: Event) => {
    if (!hoverCallback) return;
    const target = e.target as HTMLElement;
    // relatedTarget is null from DOM API when mouse leaves window
    const relatedTarget = (e as MouseEvent).relatedTarget as HTMLElement | null;
    const mark = target.closest("mark[data-comment-id]");
    if (mark) {
      const relatedMark = relatedTarget?.closest("mark[data-comment-id]");
      if (
        !relatedMark ||
        relatedMark.getAttribute("data-comment-id") !==
          mark.getAttribute("data-comment-id")
      ) {
        hoverCallback(undefined);
      }
    }
  };

  const updatePositions = () => {
    if (!positionCallback) return;
    const containerRect = container.getBoundingClientRect();
    const positions = collectHighlightPositions(
      root,
      containerRect,
      window.scrollY,
    );
    positionCallback(positions);
  };

  root.addEventListener("mouseup", handleMouseUp);
  root.addEventListener("mouseover", handleMouseOver);
  root.addEventListener("mouseout", handleMouseOut);
  window.addEventListener("scroll", updatePositions);
  window.addEventListener("resize", updatePositions);

  return {
    applyHighlights(
      comments: HighlightComment[],
      pendingSelection?: TextRange,
    ) {
      clearHighlights(root);

      const textContent = getDOMTextContent(root);

      // Resolve anchors and sort by position
      const resolved = comments
        .map((c) => {
          const anchor = findTextPosition(
            textContent,
            c.selectedText,
            c.startOffset,
          );
          if (anchor) {
            return { ...c, startOffset: anchor.start, endOffset: anchor.end };
          }
          return null;
        })
        .filter((c): c is HighlightComment => c !== null)
        .sort((a, b) => a.startOffset - b.startOffset);

      // Apply comment highlights (single amber color for all)
      for (const comment of resolved) {
        applyHighlightWithStyle(
          root,
          textContent,
          comment.startOffset,
          comment.endOffset,
          {
            attribute: "data-comment-id",
            attributeValue: comment.id,
            colorIndex: 0,
          },
        );
      }

      // Apply pending selection highlight
      if (pendingSelection) {
        applyHighlightToRange(
          root,
          pendingSelection.startOffset,
          pendingSelection.endOffset,
          {
            attribute: "data-pending",
            attributeValue: "true",
          },
        );
      }

      // Update positions after highlights are applied
      updatePositions();
    },

    clearHighlights() {
      clearHighlights(root);
    },

    getPositions(): HighlightPositions {
      const containerRect = container.getBoundingClientRect();
      return collectHighlightPositions(root, containerRect, window.scrollY);
    },

    onPositionsChange(callback: PositionChangeHandler) {
      positionCallback = callback;
      return () => {
        positionCallback = undefined;
      };
    },

    onHighlightHover(callback: HoverHandler) {
      hoverCallback = callback;
      return () => {
        hoverCallback = undefined;
      };
    },

    dispose() {
      root.removeEventListener("mouseup", handleMouseUp);
      root.removeEventListener("mouseover", handleMouseOver);
      root.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("scroll", updatePositions);
      window.removeEventListener("resize", updatePositions);
      positionCallback = undefined;
      hoverCallback = undefined;
    },
  };
}
