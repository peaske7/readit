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
  isBracketStart?: boolean;
  isBracketEnd?: boolean;
}

interface BatchedHighlightSegment {
  startOffset: number;
  endOffset: number;
  style: ExtendedHighlightStyle;
}

interface NodeSegment {
  start: number;
  end: number;
  style: ExtendedHighlightStyle;
  order: number;
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
      } catch (err) {
        // Skip if fallback also fails, but log for debugging
        console.warn("[highlight] Failed to apply highlight to range:", err);
      }
    }
  }
}

function createStyledMark(
  text: string,
  style: ExtendedHighlightStyle,
): HTMLElement {
  const mark = document.createElement("mark");
  mark.setAttribute(style.attribute, style.attributeValue);

  if (style.colorIndex !== undefined) {
    mark.setAttribute("data-color-index", String(style.colorIndex % 4));
  }

  if (style.isBracketMode) {
    mark.setAttribute("data-bracket-mode", "true");
    if (style.isBracketStart) {
      mark.setAttribute("data-bracket-start", "true");
    }
    if (style.isBracketEnd) {
      mark.setAttribute("data-bracket-end", "true");
    }
  }

  mark.textContent = text;
  return mark;
}

function normalizeNodeSegments(segments: NodeSegment[]): NodeSegment[] {
  const sorted = [...segments].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    return a.order - b.order;
  });

  const normalized: NodeSegment[] = [];
  let coveredUntil = 0;

  for (const segment of sorted) {
    const start = Math.max(segment.start, coveredUntil);
    if (start >= segment.end) continue;

    normalized.push({ ...segment, start });
    coveredUntil = segment.end;
  }

  return normalized;
}

export function applyHighlightBatch(
  root: HTMLElement,
  textContent: string,
  highlights: BatchedHighlightSegment[],
): void {
  if (highlights.length === 0) return;

  const textNodes = collectTextNodes(root);
  const segmentsByNode = new Map<Text, NodeSegment[]>();

  for (
    let highlightIndex = 0;
    highlightIndex < highlights.length;
    highlightIndex++
  ) {
    const highlight = highlights[highlightIndex];
    const overlappingNodes = textNodes.filter(
      (n) => n.end > highlight.startOffset && n.start < highlight.endOffset,
    );

    if (overlappingNodes.length === 0) continue;

    const lineCount = countLinesInRange(
      textContent,
      highlight.startOffset,
      highlight.endOffset,
    );
    const useBracketMode =
      highlight.style.isBracketMode ?? lineCount >= BRACKET_MODE_LINE_THRESHOLD;

    for (let nodeIndex = 0; nodeIndex < overlappingNodes.length; nodeIndex++) {
      const { node, start } = overlappingNodes[nodeIndex];
      const localStart = Math.max(0, highlight.startOffset - start);
      const localEnd = Math.min(node.length, highlight.endOffset - start);

      if (localStart >= localEnd) continue;

      const nodeSegments = segmentsByNode.get(node) ?? [];
      nodeSegments.push({
        start: localStart,
        end: localEnd,
        order: highlightIndex,
        style: {
          ...highlight.style,
          isBracketMode: useBracketMode,
          isBracketStart: useBracketMode && nodeIndex === 0,
          isBracketEnd:
            useBracketMode && nodeIndex === overlappingNodes.length - 1,
        },
      });
      segmentsByNode.set(node, nodeSegments);
    }
  }

  for (const { node } of textNodes) {
    const segments = segmentsByNode.get(node);
    if (!segments || segments.length === 0) continue;

    const normalized = normalizeNodeSegments(segments);
    if (normalized.length === 0) continue;

    const text = node.textContent ?? "";
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const segment of normalized) {
      if (cursor < segment.start) {
        fragment.appendChild(
          document.createTextNode(text.slice(cursor, segment.start)),
        );
      }

      fragment.appendChild(
        createStyledMark(text.slice(segment.start, segment.end), segment.style),
      );
      cursor = segment.end;
    }

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    node.replaceWith(fragment);
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
): HighlightPositions {
  const positions: Record<string, number> = {};

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
    }
  }

  return { positions };
}
