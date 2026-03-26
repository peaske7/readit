import type { TextNodeInfo } from "./types";

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

function findBlockParent(node: Node): Element | null {
  let parent = node.parentElement;
  while (parent && !BLOCK_ELEMENTS.has(parent.tagName)) {
    parent = parent.parentElement;
  }
  return parent;
}

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

    if (lastBlockParent && blockParent && lastBlockParent !== blockParent) {
      if (
        !lastBlockParent.contains(blockParent) &&
        !blockParent.contains(lastBlockParent)
      ) {
        offset += 1;
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

export function getDOMTextContent(root: Node): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  let lastBlockParent: Element | null = null;
  let node = walker.nextNode();

  while (node) {
    const blockParent = findBlockParent(node);

    if (lastBlockParent && blockParent && lastBlockParent !== blockParent) {
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

export function collectTextNodes(root: Node): TextNodeInfo[] {
  const textNodes: TextNodeInfo[] = [];
  let currentOffset = 0;
  let lastBlockParent: Element | null = null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const blockParent = findBlockParent(node);

    if (lastBlockParent && blockParent && lastBlockParent !== blockParent) {
      if (
        !lastBlockParent.contains(blockParent) &&
        !blockParent.contains(lastBlockParent)
      ) {
        currentOffset += 1;
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

export function collectTextNodesWithContent(root: Node): {
  text: string;
  nodes: TextNodeInfo[];
} {
  const nodes: TextNodeInfo[] = [];
  let text = "";
  let currentOffset = 0;
  let lastBlockParent: Element | null = null;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const blockParent = findBlockParent(node);

    if (lastBlockParent && blockParent && lastBlockParent !== blockParent) {
      if (
        !lastBlockParent.contains(blockParent) &&
        !blockParent.contains(lastBlockParent)
      ) {
        text += "\n";
        currentOffset += 1;
      }
    }

    const content = node.textContent ?? "";
    text += content;
    const length = content.length;
    nodes.push({
      node: node as Text,
      start: currentOffset,
      end: currentOffset + length,
    });
    currentOffset += length;
    lastBlockParent = blockParent;
    node = walker.nextNode();
  }

  return { text, nodes };
}

export function createRangesForHighlight(
  root: Node,
  startOffset: number,
  endOffset: number,
): Range[] {
  const textNodes = collectTextNodes(root);
  return createRangesFromNodes(textNodes, startOffset, endOffset);
}

export function createRangesFromNodes(
  textNodes: TextNodeInfo[],
  startOffset: number,
  endOffset: number,
): Range[] {
  const ranges: Range[] = [];

  for (const { node, start, end } of textNodes) {
    if (end <= startOffset || start >= endOffset) continue;

    const range = document.createRange();
    range.setStart(node, Math.max(0, startOffset - start));
    range.setEnd(node, Math.min(node.length, endOffset - start));
    ranges.push(range);
  }

  return ranges;
}
