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

export type SelectionHandler = (
  text: string,
  startOffset: number,
  endOffset: number,
) => void;
export type PositionChangeHandler = (positions: HighlightPositions) => void;
export type HoverHandler = (commentId: string | undefined) => void;
export type ClickHandler = (commentId: string) => void;
export type ContentHeightHandler = (height: number) => void;

export interface Highlighter {
  applyHighlights(
    comments: HighlightComment[],
    pendingSelection?: TextRange,
  ): void;
  clearHighlights(): void;
  getPositions(): HighlightPositions;
  onPositionsChange(callback: PositionChangeHandler): () => void;
  onHighlightHover(callback: HoverHandler): () => void;
  onHighlightClick(callback: ClickHandler): () => void;
  onContentHeightChange?(callback: ContentHeightHandler): () => void;
  dispose(): void;
}

interface MarkdownOptions {
  type: "markdown";
  root: HTMLElement;
  container: HTMLElement;
  onSelect: SelectionHandler;
}

interface IframeOptions {
  type: "iframe";
  getIframe: () => HTMLIFrameElement | null;
  onSelect: SelectionHandler;
}

export type HighlighterOptions = MarkdownOptions | IframeOptions;

export function createHighlighter(options: HighlighterOptions): Highlighter {
  return options.type === "markdown"
    ? createMarkdownHighlighter(options)
    : createIframeHighlighter(options);
}

function createMarkdownHighlighter(options: MarkdownOptions): Highlighter {
  const { root, container, onSelect } = options;

  let positionCallback: PositionChangeHandler | undefined;
  let hoverCallback: HoverHandler | undefined;
  let clickCallback: ClickHandler | undefined;
  let scrollRafId: number | null = null;

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection
      .toString()
      .trim()
      .replace(/\r?\n\s*/g, "\n");
    if (text.length === 0) return;

    const range = selection.getRangeAt(0);

    // Reject erroneous whole-document selections (caused by DOM mutation during interaction)
    if (
      range.startContainer === root &&
      range.startOffset === 0 &&
      range.endContainer === root &&
      range.endOffset === root.childNodes.length
    ) {
      return;
    }

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

  const handleClick = (e: Event) => {
    if (!clickCallback) return;
    const target = e.target as HTMLElement;
    const mark = target.closest("mark[data-comment-id]");
    if (mark) {
      const commentId = mark.getAttribute("data-comment-id");
      if (commentId) {
        clickCallback(commentId);
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

  const handleScroll = () => {
    if (scrollRafId !== null) return;
    scrollRafId = requestAnimationFrame(() => {
      updatePositions();
      scrollRafId = null;
    });
  };

  root.addEventListener("mouseup", handleMouseUp);
  root.addEventListener("mouseover", handleMouseOver);
  root.addEventListener("mouseout", handleMouseOut);
  root.addEventListener("click", handleClick);
  window.addEventListener("scroll", handleScroll, { passive: true });
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

      // Defer position update to next frame to ensure browser has completed layout
      // after DOM changes from highlight application
      requestAnimationFrame(() => updatePositions());
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

    onHighlightClick(callback: ClickHandler) {
      clickCallback = callback;
      return () => {
        clickCallback = undefined;
      };
    },

    dispose() {
      root.removeEventListener("mouseup", handleMouseUp);
      root.removeEventListener("mouseover", handleMouseOver);
      root.removeEventListener("mouseout", handleMouseOut);
      root.removeEventListener("click", handleClick);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updatePositions);
      if (scrollRafId !== null) {
        cancelAnimationFrame(scrollRafId);
      }
      positionCallback = undefined;
      hoverCallback = undefined;
      clickCallback = undefined;
    },
  };
}

function createIframeHighlighter(options: IframeOptions): Highlighter {
  const { getIframe, onSelect } = options;

  let isReady = false;
  let positionCallback: PositionChangeHandler | undefined;
  let hoverCallback: HoverHandler | undefined;
  let clickCallback: ClickHandler | undefined;
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

      case "highlightClick":
        if (clickCallback && event.data.commentId) {
          clickCallback(event.data.commentId);
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

    onHighlightClick(callback: ClickHandler) {
      clickCallback = callback;
      return () => {
        clickCallback = undefined;
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
      clickCallback = undefined;
      contentHeightCallback = undefined;
      isReady = false;
      pendingHighlights = undefined;
    },
  };
}
