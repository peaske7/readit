import {
  collectTextNodesWithContent,
  createRangesForHighlight,
  createRangesFromNodes,
  getTextOffset,
} from "./dom";
import { HighlightRegistry } from "./highlight-registry";
import type { HighlightComment, TextNodeInfo } from "./types";

export type SelectionHandler = (
  text: string,
  startOffset: number,
  endOffset: number,
  selectionTop: number,
) => void;
export type ClickHandler = (commentId: string) => void;
export type CacheHandler = () => void;

export interface Highlighter {
  applyHighlights(comments: HighlightComment[]): void;
  clearHighlights(): void;
  onHighlightClick(callback: ClickHandler): () => void;

  setFocused(commentId: string | undefined): void;
  scrollToComment(commentId: string): void;
  getRanges(commentId: string): Range[];
  getMarkerAnchors(
    containerRect: DOMRect,
  ): Map<string, { top: number; left: number }>;

  onCacheInvalidated(callback: CacheHandler): () => void;

  dispose(): void;
}

export interface HighlighterOptions {
  root: HTMLElement;
  container: HTMLElement;
  onSelect: SelectionHandler;
}

/** How long a selection must sit still before it counts as finished. */
const SELECTION_SETTLE_MS = 300;

export function createHighlighter(options: HighlighterOptions): Highlighter {
  const { root, container, onSelect } = options;

  let clickCallback: ClickHandler | undefined;
  let cacheCallback: CacheHandler | undefined;

  const activePositions = new Map<string, { start: number; end: number }>();
  let lastTextContent = "";

  const registry = new HighlightRegistry();

  // Touch selection (long-press, then dragging the handles) never fires
  // `mouseup`, so `selectionchange` is the only signal on phones. It also
  // fires on every mouse-drag step, so it is debounced, held back while a
  // mouse button is down, and deduplicated against the last emitted range.
  let lastEmitted: { start: number; end: number } | undefined;
  let mouseButtonDown = false;
  let selectionTimer: ReturnType<typeof setTimeout> | undefined;

  const captureSelection = (force: boolean) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }
    if (!root.contains(selection.anchorNode)) return;

    const text = selection
      .toString()
      .trim()
      .replace(/\r?\n\s*/g, "\n");
    if (text.length === 0) return;

    const range = selection.getRangeAt(0);

    // Reject whole-document selections caused by DOM mutation
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
    if (
      !force &&
      lastEmitted?.start === startOffset &&
      lastEmitted.end === endOffset
    ) {
      return;
    }
    lastEmitted = { start: startOffset, end: endOffset };

    const rangeRect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const selectionTop = rangeRect.top - containerRect.top;

    onSelect(text, startOffset, endOffset, selectionTop);

    requestAnimationFrame(() => {
      const pendingRanges = createRangesForHighlight(
        root,
        startOffset,
        endOffset,
      );
      registry.setPending(pendingRanges);
    });
  };

  const cancelSettle = () => {
    if (selectionTimer) clearTimeout(selectionTimer);
    selectionTimer = undefined;
  };

  const handleMouseUp = () => {
    cancelSettle();
    captureSelection(true);
  };

  const handleSelectionChange = () => {
    if (window.getSelection()?.isCollapsed !== false) {
      // Collapsing (a click, or focusing an input) ends the gesture, so the
      // same text may be selected again afterwards.
      lastEmitted = undefined;
      cancelSettle();
      return;
    }
    if (mouseButtonDown) return;
    cancelSettle();
    selectionTimer = setTimeout(() => {
      selectionTimer = undefined;
      captureSelection(false);
    }, SELECTION_SETTLE_MS);
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") mouseButtonDown = true;
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse") mouseButtonDown = false;
  };

  const handleClick = (e: MouseEvent) => {
    if (!clickCallback) return;

    const commentId = registry.hitTest(e.clientX, e.clientY);
    if (commentId) {
      clickCallback(commentId);
    }
  };

  const applyDiff = (
    resolved: Map<string, { start: number; end: number; colorIndex: number }>,
    textNodes: TextNodeInfo[],
  ) => {
    let changed = false;

    for (const [id, prev] of activePositions) {
      const next = resolved.get(id);
      if (!next || prev.start !== next.start || prev.end !== next.end) {
        registry.removeComment(id);
        activePositions.delete(id);
        changed = true;
      }
    }

    for (const [id, entry] of resolved) {
      if (!activePositions.has(id)) {
        const ranges = createRangesFromNodes(textNodes, entry.start, entry.end);
        if (ranges.length > 0) {
          registry.updateComment(id, ranges, entry.colorIndex);
          activePositions.set(id, { start: entry.start, end: entry.end });
          changed = true;
        }
      }
    }

    if (changed) {
      cacheCallback?.();
    }
  };

  root.addEventListener("mouseup", handleMouseUp);
  root.addEventListener("click", handleClick);
  document.addEventListener("selectionchange", handleSelectionChange);
  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("pointerup", handlePointerUp);
  document.addEventListener("pointercancel", handlePointerUp);

  return {
    applyHighlights(comments: HighlightComment[]) {
      const { text: textContent, nodes: textNodes } =
        collectTextNodesWithContent(root);

      const contentChanged = textContent !== lastTextContent;
      if (contentChanged) {
        registry.clearAll();
        activePositions.clear();
        lastTextContent = textContent;
      }

      const resolved = new Map<
        string,
        { start: number; end: number; colorIndex: number }
      >();
      let colorIdx = 0;
      for (const c of comments) {
        if (c.startOffset >= 0 && c.endOffset > c.startOffset) {
          resolved.set(c.id, {
            start: c.startOffset,
            end: c.endOffset,
            colorIndex: colorIdx % 4,
          });
          colorIdx++;
        }
      }

      applyDiff(resolved, textNodes);
    },

    clearHighlights() {
      registry.clearAll();
      activePositions.clear();
      lastTextContent = "";
      cacheCallback?.();
    },

    onHighlightClick(callback: ClickHandler) {
      clickCallback = callback;
      return () => {
        clickCallback = undefined;
      };
    },

    setFocused(commentId: string | undefined) {
      registry.setFocused(commentId);
    },

    scrollToComment(commentId: string) {
      registry.scrollToComment(commentId);
    },

    getRanges(commentId: string): Range[] {
      return registry.getRanges(commentId);
    },

    getMarkerAnchors(
      containerRect: DOMRect,
    ): Map<string, { top: number; left: number }> {
      return registry.getMarkerAnchors(containerRect);
    },

    onCacheInvalidated(callback: CacheHandler) {
      cacheCallback = callback;
      return () => {
        cacheCallback = undefined;
      };
    },

    dispose() {
      registry.dispose();
      cancelSettle();
      root.removeEventListener("mouseup", handleMouseUp);
      root.removeEventListener("click", handleClick);
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      clickCallback = undefined;
      cacheCallback = undefined;
    },
  };
}
