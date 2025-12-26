import type { HighlightPositions, HighlightStyle, TextNodeInfo } from "./types";

/**
 * Block-level elements that should have newlines between them.
 * Used to normalize whitespace in text extraction.
 */
const BLOCK_ELEMENTS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "PRE",
  "BLOCKQUOTE",
  "LI",
  "TR",
  "BR",
]);

/**
 * Find the closest block-level ancestor of a node.
 */
function findBlockParent(node: Node): Element | null {
  let parent = node.parentElement;
  while (parent && !BLOCK_ELEMENTS.has(parent.tagName)) {
    parent = parent.parentElement;
  }
  return parent;
}

/**
 * Calculate text offset from root to a specific node position.
 * Accounts for newlines between block elements to match getDOMTextContent.
 */
export function getTextOffset(
  root: Node,
  targetNode: Node,
  targetOffset: number,
): number {
  let offset = 0;
  let lastBlockParent: Element | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    const blockParent = findBlockParent(node);

    // Add newline when transitioning between different block parents
    if (lastBlockParent && blockParent && lastBlockParent !== blockParent) {
      if (
        !lastBlockParent.contains(blockParent) &&
        !blockParent.contains(lastBlockParent)
      ) {
        offset += 1; // Account for the newline
      }
    }

    if (node === targetNode) {
      return offset + targetOffset;
    }
    offset += node.textContent?.length ?? 0;
    lastBlockParent = blockParent;
    node = walker.nextNode();
  }

  return offset;
}

/**
 * Extract all text content from a DOM tree.
 * Inserts newlines between block-level elements to match browser selection behavior.
 */
export function getDOMTextContent(root: Node): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  let lastBlockParent: Element | null = null;
  let node = walker.nextNode();

  while (node) {
    const blockParent = findBlockParent(node);

    // Insert newline when transitioning between different block parents
    if (lastBlockParent && blockParent && lastBlockParent !== blockParent) {
      // Only add newline if blocks are siblings (not nested)
      if (
        !lastBlockParent.contains(blockParent) &&
        !blockParent.contains(lastBlockParent)
      ) {
        text += "\n";
      }
    }

    text += node.textContent ?? "";
    lastBlockParent = blockParent;
    node = walker.nextNode();
  }

  return text;
}

/**
 * Collect all text nodes with their cumulative offset ranges.
 * Accounts for newlines between block elements to match getDOMTextContent.
 */
export function collectTextNodes(root: Node): TextNodeInfo[] {
  const textNodes: TextNodeInfo[] = [];
  let currentOffset = 0;
  let lastBlockParent: Element | null = null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const blockParent = findBlockParent(node);

    // Account for newline when transitioning between different block parents
    // (same logic as getDOMTextContent)
    if (lastBlockParent && blockParent && lastBlockParent !== blockParent) {
      if (
        !lastBlockParent.contains(blockParent) &&
        !blockParent.contains(lastBlockParent)
      ) {
        currentOffset += 1; // Account for the newline
      }
    }

    const length = node.textContent?.length ?? 0;
    textNodes.push({
      node: node as Text,
      start: currentOffset,
      end: currentOffset + length,
    });
    currentOffset += length;
    lastBlockParent = blockParent;
    node = walker.nextNode();
  }

  return textNodes;
}

/**
 * Extended style configuration for highlight marks with color and bracket mode support.
 */
export interface ExtendedHighlightStyle extends HighlightStyle {
  colorIndex?: number;
  isBracketMode?: boolean;
}

/**
 * Line threshold for bracket mode (selections spanning this many lines or more)
 */
const BRACKET_MODE_LINE_THRESHOLD = 5;

export function countLinesInRange(
  textContent: string,
  startOffset: number,
  endOffset: number,
): number {
  const slice = textContent.slice(startOffset, endOffset);
  return (slice.match(/\n/g) || []).length + 1;
}

// Note: applyHighlightToRange and applyHighlightWithStyle share similar logic intentionally.
// They differ in styling: applyHighlightToRange is for simple pending selections,
// applyHighlightWithStyle adds color indices and bracket mode for saved comments.
// Keeping them separate avoids unnecessary complexity in a shared abstraction.

/**
 * Apply highlight mark elements to a text range (for pending selections).
 */
export function applyHighlightToRange(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
  style: HighlightStyle,
): void {
  const textNodes = collectTextNodes(root);
  const overlappingNodes = textNodes.filter(
    (n) => n.end > startOffset && n.start < endOffset,
  );

  if (overlappingNodes.length === 0) {
    return;
  }

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
      // Range crosses element boundaries - use extractContents fallback
      try {
        const fragment = range.extractContents();
        mark.appendChild(fragment);
        range.insertNode(mark);
      } catch {
        // Skip if fallback also fails
      }
    }
  }
}

/**
 * Apply highlight with extended styling (color index, bracket mode) for saved comments.
 */
export function applyHighlightWithStyle(
  root: HTMLElement,
  textContent: string,
  startOffset: number,
  endOffset: number,
  style: ExtendedHighlightStyle,
): void {
  const textNodes = collectTextNodes(root);
  const overlappingNodes = textNodes.filter(
    (n) => n.end > startOffset && n.start < endOffset,
  );

  if (overlappingNodes.length === 0) {
    return;
  }

  const lineCount = countLinesInRange(textContent, startOffset, endOffset);
  const useBracketMode =
    style.isBracketMode ?? lineCount >= BRACKET_MODE_LINE_THRESHOLD;

  let isFirst = true;

  for (let i = 0; i < overlappingNodes.length; i++) {
    const { node: textNode, start } = overlappingNodes[i];
    const isLast = i === overlappingNodes.length - 1;

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

    if (style.colorIndex !== undefined) {
      mark.setAttribute("data-color-index", String(style.colorIndex % 4));
    }

    if (useBracketMode) {
      mark.setAttribute("data-bracket-mode", "true");
      if (isFirst) {
        mark.setAttribute("data-bracket-start", "true");
      }
      if (isLast) {
        mark.setAttribute("data-bracket-end", "true");
      }
    }

    try {
      range.surroundContents(mark);
    } catch {
      // Range crosses element boundaries - use extractContents fallback
      try {
        const fragment = range.extractContents();
        mark.appendChild(fragment);
        range.insertNode(mark);
      } catch {
        // Skip if fallback also fails
      }
    }

    isFirst = false;
  }
}

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
