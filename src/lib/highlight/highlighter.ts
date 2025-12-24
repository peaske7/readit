import { findTextPosition } from "./core";
import {
  applyHighlightToRange,
  applyHighlightWithStyle,
  clearHighlights,
  collectHighlightPositions,
  getDOMTextContent,
  getTextOffset,
} from "./dom";
import type { HighlightComment, HighlightPositions, TextRange } from "./types";

// Callback types
export type SelectionHandler = (
  text: string,
  startOffset: number,
  endOffset: number,
) => void;
export type PositionChangeHandler = (positions: HighlightPositions) => void;
export type HoverHandler = (commentId: string | undefined) => void;
export type ContentHeightHandler = (height: number) => void;

// Highlighter interface
export interface Highlighter {
  applyHighlights(
    comments: HighlightComment[],
    pendingSelection?: TextRange,
  ): void;
  clearHighlights(): void;
  getPositions(): HighlightPositions;
  onPositionsChange(callback: PositionChangeHandler): () => void;
  onHighlightHover(callback: HoverHandler): () => void;
  onContentHeightChange?(callback: ContentHeightHandler): () => void;
  dispose(): void;
}

// Options for markdown documents (direct DOM)
interface MarkdownOptions {
  type: "markdown";
  root: HTMLElement;
  container: HTMLElement;
  onSelect: SelectionHandler;
}

// Options for HTML documents (iframe)
interface IframeOptions {
  type: "iframe";
  getIframe: () => HTMLIFrameElement | null;
  onSelect: SelectionHandler;
}

export type HighlighterOptions = MarkdownOptions | IframeOptions;

// Single factory function
export function createHighlighter(options: HighlighterOptions): Highlighter {
  return options.type === "markdown"
    ? createMarkdownHighlighter(options)
    : createIframeHighlighter(options);
}

// Markdown highlighter implementation
function createMarkdownHighlighter(options: MarkdownOptions): Highlighter {
  const { root, container, onSelect } = options;

  let positionCallback: PositionChangeHandler | undefined;
  let hoverCallback: HoverHandler | undefined;

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

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
      hoverCallback(mark.getAttribute("data-comment-id") ?? undefined);
    }
  };

  const handleMouseOut = (e: Event) => {
    if (!hoverCallback) return;
    const target = e.target as HTMLElement;
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

// Iframe highlighter implementation
function createIframeHighlighter(options: IframeOptions): Highlighter {
  const { getIframe, onSelect } = options;

  let isReady = false;
  let positionCallback: PositionChangeHandler | undefined;
  let hoverCallback: HoverHandler | undefined;
  let contentHeightCallback: ContentHeightHandler | undefined;
  let pendingHighlights:
    | { comments: HighlightComment[]; pending?: TextRange }
    | undefined;

  const handleMessage = (event: MessageEvent) => {
    const iframe = getIframe();
    if (!iframe || iframe.contentWindow !== event.source) return;

    switch (event.data.type) {
      case "iframeReady":
        isReady = true;
        if (pendingHighlights) {
          sendHighlights(pendingHighlights.comments, pendingHighlights.pending);
          pendingHighlights = undefined;
        }
        break;

      case "textSelection":
        onSelect(event.data.text, event.data.startOffset, event.data.endOffset);
        break;

      case "highlightPositions":
        if (positionCallback) {
          const positions: Record<string, number> = {};
          const documentPositions: Record<string, number> = {};
          for (const [id, top] of Object.entries(event.data.positions)) {
            if (typeof top === "number") {
              positions[id] = top;
            }
          }
          for (const [id, top] of Object.entries(
            event.data.documentPositions || {},
          )) {
            if (typeof top === "number") {
              documentPositions[id] = top;
            }
          }
          positionCallback({
            positions,
            documentPositions,
            pendingTop:
              typeof event.data.pendingTop === "number"
                ? event.data.pendingTop
                : undefined,
          });
        }
        break;

      case "highlightHover":
        if (hoverCallback) {
          hoverCallback(event.data.commentId);
        }
        break;

      case "contentHeight":
        if (contentHeightCallback && typeof event.data.height === "number") {
          contentHeightCallback(event.data.height);
        }
        break;
    }
  };

  const sendHighlights = (
    comments: HighlightComment[],
    pending?: TextRange,
  ) => {
    const iframe = getIframe();
    iframe?.contentWindow?.postMessage(
      {
        type: "applyHighlights",
        comments: comments.map((c) => ({
          id: c.id,
          selectedText: c.selectedText,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
        })),
        pendingSelection: pending ?? null,
      },
      "*",
    );
  };

  window.addEventListener("message", handleMessage);

  return {
    applyHighlights(
      comments: HighlightComment[],
      pendingSelection?: TextRange,
    ) {
      if (isReady) {
        sendHighlights(comments, pendingSelection);
      } else {
        pendingHighlights = { comments, pending: pendingSelection };
      }
    },

    clearHighlights() {
      if (isReady) {
        sendHighlights([], undefined);
      }
    },

    getPositions(): HighlightPositions {
      return { positions: {}, documentPositions: {} };
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

    onContentHeightChange(callback: ContentHeightHandler) {
      contentHeightCallback = callback;
      return () => {
        contentHeightCallback = undefined;
      };
    },

    dispose() {
      window.removeEventListener("message", handleMessage);
      positionCallback = undefined;
      hoverCallback = undefined;
      contentHeightCallback = undefined;
      isReady = false;
      pendingHighlights = undefined;
    },
  };
}
