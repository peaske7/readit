import type { HighlightComment, HighlightPositions, TextRange } from "../types";
import type {
  HighlightAdapter,
  HoverHandler,
  PositionChangeHandler,
  SelectionHandler,
} from "./types";

export type ContentHeightHandler = (height: number) => void;

export interface IframeAdapterOptions {
  /** React ref to the iframe element */
  getIframe: () => HTMLIFrameElement | null;
  /** Callback when user selects text in the iframe */
  onSelect: SelectionHandler;
}

export interface IframeHighlightAdapter extends HighlightAdapter {
  onContentHeightChange: (callback: ContentHeightHandler) => () => void;
}

export function createIframeAdapter(
  options: IframeAdapterOptions,
): IframeHighlightAdapter {
  const { getIframe, onSelect } = options;

  let isReady = false;
  let positionCallback: PositionChangeHandler | undefined;
  let hoverCallback: HoverHandler | undefined;
  let contentHeightCallback: ContentHeightHandler | undefined;
  let pendingHighlights:
    | {
        comments: HighlightComment[];
        pending?: TextRange;
      }
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
    // Use "*" target origin because srcdoc iframes have opaque origin
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
      // Positions are reported asynchronously via callback
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
