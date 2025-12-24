/**
 * DOM manipulation utilities for highlighting.
 * These require a browser environment with DOM APIs.
 *
 * Functions marked with @iframe are included in the generated iframe runtime.
 */

import type { HighlightPositions, HighlightStyle, TextNodeInfo } from "./types";

/**
 * Calculate text offset from root to a specific node position.
 * Uses TreeWalker to traverse text nodes.
 *
 * @iframe
 */
export function getTextOffset(
  root: Node,
  targetNode: Node,
  targetOffset: number,
): number {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += node.textContent?.length ?? 0;
    node = walker.nextNode();
  }

  return offset;
}

/**
 * Extract all text content from a DOM tree using TreeWalker.
 *
 * @iframe
 */
export function getDOMTextContent(root: Node): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  let node = walker.nextNode();

  while (node) {
    text += node.textContent ?? "";
    node = walker.nextNode();
  }

  return text;
}

/**
 * Collect all text nodes with their cumulative offset ranges.
 *
 * @iframe
 */
export function collectTextNodes(root: Node): TextNodeInfo[] {
  const textNodes: TextNodeInfo[] = [];
  let currentOffset = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent?.length ?? 0;
    textNodes.push({
      node: node as Text,
      start: currentOffset,
      end: currentOffset + length,
    });
    currentOffset += length;
    node = walker.nextNode();
  }

  return textNodes;
}

/**
 * Apply highlight mark elements to a text range.
 * Handles ranges that span multiple text nodes.
 *
 * @iframe
 */
export function applyHighlightToRange(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
  style: HighlightStyle,
): void {
  const textNodes = collectTextNodes(root);

  // Find nodes that overlap with the range
  const overlappingNodes = textNodes.filter(
    (n) => n.end > startOffset && n.start < endOffset,
  );

  if (overlappingNodes.length === 0) {
    return;
  }

  // Apply highlight to each overlapping node
  for (const { node: textNode, start } of overlappingNodes) {
    const nodeStart = Math.max(0, startOffset - start);
    const nodeEnd = Math.min(textNode.length, endOffset - start);

    if (nodeStart >= nodeEnd) {
      continue;
    }

    const range = document.createRange();
    range.setStart(textNode, nodeStart);
    range.setEnd(textNode, nodeEnd);

    const mark = document.createElement("mark");
    mark.setAttribute(style.attribute, style.attributeValue);

    try {
      range.surroundContents(mark);
    } catch {
      // Range crosses element boundaries, skip
    }
  }
}

/**
 * Remove all highlight marks from DOM.
 *
 * @iframe
 */
export function clearHighlights(
  root: HTMLElement,
  selector = "mark[data-comment-id], mark[data-pending]",
): void {
  const marks = root.querySelectorAll(selector);

  for (const mark of marks) {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
  }
}

/**
 * Collect highlight positions relative to a container and document.
 * Returns Y-positions for margin note alignment and minimap.
 *
 * @iframe
 */
export function collectHighlightPositions(
  root: HTMLElement,
  containerRect: DOMRect,
  scrollY = 0,
): HighlightPositions {
  const positions: Record<string, number> = {};
  const documentPositions: Record<string, number> = {};

  // Collect comment highlight positions
  const marks = root.querySelectorAll("mark[data-comment-id]");
  for (const mark of marks) {
    const commentId = mark.getAttribute("data-comment-id");
    if (!commentId) continue;

    // Get position relative to container (for margin notes)
    const markRect = mark.getBoundingClientRect();
    const relativeTop = markRect.top - containerRect.top;

    // Use first occurrence of each comment id
    if (!(commentId in positions)) {
      positions[commentId] = relativeTop;
      // Document-absolute position (for minimap)
      documentPositions[commentId] = markRect.top + scrollY;
    }
  }

  // Get pending highlight position
  let pendingTop: number | undefined;
  const pendingMark = root.querySelector("mark[data-pending]");
  if (pendingMark) {
    const pendingRect = pendingMark.getBoundingClientRect();
    pendingTop = pendingRect.top - containerRect.top;
  }

  return { positions, documentPositions, pendingTop };
}

/**
 * Collect highlight positions relative to viewport (for iframe use).
 * The iframe doesn't have access to parent container rect.
 * For iframe, positions are viewport-relative and documentPositions include scroll offset.
 *
 * @iframe
 */
export function collectHighlightPositionsViewport(
  root: HTMLElement,
  scrollY = 0,
): HighlightPositions {
  const positions: Record<string, number> = {};
  const documentPositions: Record<string, number> = {};

  const marks = root.querySelectorAll("mark[data-comment-id]");
  for (const mark of marks) {
    const commentId = mark.getAttribute("data-comment-id");
    if (!commentId || positions[commentId] !== undefined) continue;

    const rect = mark.getBoundingClientRect();
    positions[commentId] = rect.top;
    documentPositions[commentId] = rect.top + scrollY;
  }

  let pendingTop: number | undefined;
  const pendingMark = root.querySelector("mark[data-pending]");
  if (pendingMark) {
    const pendingRect = pendingMark.getBoundingClientRect();
    pendingTop = pendingRect.top;
  }

  return { positions, documentPositions, pendingTop };
}
