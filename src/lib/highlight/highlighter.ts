import {
  applyHighlightBatch,
  applyHighlightToRange,
  clearHighlights,
  getDOMTextContent,
  getTextOffset,
} from "./dom";
import { Resolver } from "./resolver";
import type { HighlightComment } from "./types";

export type SelectionHandler = (
  text: string,
  startOffset: number,
  endOffset: number,
  selectionTop: number,
) => void;
export type HoverHandler = (commentId: string | undefined) => void;
export type ClickHandler = (commentId: string) => void;
export interface Highlighter {
  applyHighlights(comments: HighlightComment[]): void;
  clearHighlights(): void;
  onHighlightHover(callback: HoverHandler): () => void;
  onHighlightClick(callback: ClickHandler): () => void;
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

  // Incremental diffing state — avoids full clear+rebuild on every comment change
  const activeHighlights = new Map<string, { start: number; end: number }>();
  let lastTextContent = "";

  // Web Worker for anchor resolution (offloads indexOf from main thread)
  const resolver = new Resolver();
  let resolveGeneration = 0;

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

    // Apply pending highlight directly (not through applyHighlights cycle)
    // so it persists when native ::selection clears on textarea focus
    clearHighlights(root, "mark[data-pending]");
    applyHighlightToRange(root, startOffset, endOffset, {
      attribute: "data-pending",
      attributeValue: "true",
    });
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

  /** Diff resolved anchors against active highlights and apply DOM changes. */
  const applyDiff = (
    textContent: string,
    resolved: Map<
      string,
      { start: number; end: number; comment: HighlightComment }
    >,
  ) => {
    const toRemove: string[] = [];
    const toAdd: string[] = [];

    for (const [id, prev] of activeHighlights) {
      const next = resolved.get(id);
      if (!next) {
        toRemove.push(id);
      } else if (prev.start !== next.start || prev.end !== next.end) {
        toRemove.push(id);
        toAdd.push(id);
      }
    }

    for (const id of resolved.keys()) {
      if (!activeHighlights.has(id)) {
        toAdd.push(id);
      }
    }

    if (toRemove.length === 0 && toAdd.length === 0) return;

    for (const id of toRemove) {
      clearHighlights(root, `mark[data-comment-id="${id}"]`);
      activeHighlights.delete(id);
    }

    if (toAdd.length > 0) {
      const newHighlights = toAdd
        .map((id) => resolved.get(id)!)
        .sort((a, b) => a.start - b.start);

      applyHighlightBatch(
        root,
        textContent,
        newHighlights.map((h) => ({
          startOffset: h.start,
          endOffset: h.end,
          style: {
            attribute: "data-comment-id",
            attributeValue: h.comment.id,
            colorIndex: 0,
          },
        })),
      );

      for (const id of toAdd) {
        const range = resolved.get(id)!;
        activeHighlights.set(id, { start: range.start, end: range.end });
      }
    }
  };

  root.addEventListener("mouseup", handleMouseUp);
  root.addEventListener("mouseover", handleMouseOver);
  root.addEventListener("mouseout", handleMouseOut);
  root.addEventListener("click", handleClick);

  return {
    applyHighlights(comments: HighlightComment[]) {
      console.time("[perf] getDOMTextContent");
      const textContent = getDOMTextContent(root);
      console.timeEnd("[perf] getDOMTextContent");

      // If DOM content changed (e.g. document reload), full rebuild is required
      const contentChanged = textContent !== lastTextContent;
      if (contentChanged) {
        console.time("[perf] clearHighlights (full rebuild)");
        clearHighlights(root);
        console.timeEnd("[perf] clearHighlights (full rebuild)");
        activeHighlights.clear();
        lastTextContent = textContent;
      }

      // Bump generation so stale Worker responses are discarded
      const generation = ++resolveGeneration;

      // Resolve anchors off the main thread, then diff and apply
      console.time("[perf] resolver.resolve (worker)");
      resolver.resolve(textContent, comments).then((anchorMap) => {
        console.timeEnd("[perf] resolver.resolve (worker)");
        // Discard if a newer applyHighlights call has started
        if (generation !== resolveGeneration) return;

        const resolved = new Map<
          string,
          { start: number; end: number; comment: HighlightComment }
        >();
        for (const c of comments) {
          const anchor = anchorMap.get(c.id);
          if (anchor) {
            resolved.set(c.id, {
              start: anchor.start,
              end: anchor.end,
              comment: {
                ...c,
                startOffset: anchor.start,
                endOffset: anchor.end,
              },
            });
          }
        }

        console.time("[perf] applyDiff");
        applyDiff(textContent, resolved);
        console.timeEnd("[perf] applyDiff");
      });
    },

    clearHighlights() {
      clearHighlights(root);
      activeHighlights.clear();
      lastTextContent = "";
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
      resolveGeneration++;
      resolver.dispose();
      root.removeEventListener("mouseup", handleMouseUp);
      root.removeEventListener("mouseover", handleMouseOver);
      root.removeEventListener("mouseout", handleMouseOut);
      root.removeEventListener("click", handleClick);
      hoverCallback = undefined;
      clickCallback = undefined;
    },
  };
}
