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
export type HoverHandler = (commentId: string | undefined) => void;
export type ClickHandler = (commentId: string) => void;
export type CacheHandler = () => void;

export interface Highlighter {
  applyHighlights(comments: HighlightComment[]): void;
  clearHighlights(): void;
  onHighlightHover(callback: HoverHandler): () => void;
  onHighlightClick(callback: ClickHandler): () => void;

  setFocused(commentId: string | undefined): void;
  scrollToComment(commentId: string): void;
  getPositions(containerRect: DOMRect): Map<string, number>;
  getHighlightedIds(): string[];
  isPointInHighlight(x: number, y: number): boolean;

  onCacheInvalidated(callback: CacheHandler): () => void;

  dispose(): void;
}

export interface HighlighterOptions {
  root: HTMLElement;
  container: HTMLElement;
  onSelect: SelectionHandler;
}

export function createHighlighter(options: HighlighterOptions): Highlighter {
  const { root, container, onSelect } = options;

  let hoverCallback: HoverHandler | undefined;
  let clickCallback: ClickHandler | undefined;
  let cacheCallback: CacheHandler | undefined;

  const activePositions = new Map<string, { start: number; end: number }>();
  let lastTextContent = "";

  const registry = new HighlightRegistry();

  let lastHoveredId: string | undefined;

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

    const rangeRect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const selectionTop = rangeRect.top - containerRect.top;

    onSelect(text, startOffset, endOffset, selectionTop);

    // Apply pending highlight after React re-render settles.
    // onSelect triggers a state update that may cause React to re-render,
    // replacing DOM nodes and invalidating pre-existing Range objects.
    // Deferring to rAF ensures Ranges are created against the final DOM.
    requestAnimationFrame(() => {
      const pendingRanges = createRangesForHighlight(
        root,
        startOffset,
        endOffset,
      );
      registry.setPending(pendingRanges);
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!hoverCallback) return;

    const id = registry.hitTest(e.clientX, e.clientY);

    if (id !== lastHoveredId) {
      lastHoveredId = id;
      hoverCallback(id);
    }
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
  root.addEventListener("mousemove", handleMouseMove);
  root.addEventListener("click", handleClick);

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

    setFocused(commentId: string | undefined) {
      registry.setFocused(commentId);
    },

    scrollToComment(commentId: string) {
      registry.scrollToComment(commentId);
    },

    getPositions(containerRect: DOMRect): Map<string, number> {
      return registry.getPositions(containerRect);
    },

    getHighlightedIds(): string[] {
      return registry.getHighlightedIds();
    },

    isPointInHighlight(x: number, y: number): boolean {
      return registry.isPointInHighlight(x, y);
    },

    onCacheInvalidated(callback: CacheHandler) {
      cacheCallback = callback;
      return () => {
        cacheCallback = undefined;
      };
    },

    dispose() {
      registry.dispose();
      root.removeEventListener("mouseup", handleMouseUp);
      root.removeEventListener("mousemove", handleMouseMove);
      root.removeEventListener("click", handleClick);
      hoverCallback = undefined;
      clickCallback = undefined;
      cacheCallback = undefined;
      lastHoveredId = undefined;
    },
  };
}
