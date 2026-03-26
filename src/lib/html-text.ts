const BLOCK_ELEMENTS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "blockquote",
  "li",
  "tr",
  "br",
]);

interface TextNode {
  text: string;
  blockAncestorPath: string[];
}

export function extractTextFromHtml(html: string): string {
  const textNodes = collectTextNodesFromHtml(html);
  if (textNodes.length === 0) return "";

  let result = "";
  let lastBlockPath: string[] | null = null;

  for (const node of textNodes) {
    if (lastBlockPath) {
      const lastBlock = lastBlockPath;
      const currBlock = node.blockAncestorPath;

      if (
        lastBlock.length > 0 &&
        currBlock.length > 0 &&
        !isNested(lastBlock, currBlock)
      ) {
        if (
          lastBlock[lastBlock.length - 1] !== currBlock[currBlock.length - 1]
        ) {
          result += "\n";
        }
      }
    }

    result += node.text;
    lastBlockPath = node.blockAncestorPath;
  }

  return result;
}

function isNested(pathA: string[], pathB: string[]): boolean {
  const blockA = pathA[pathA.length - 1];
  const blockB = pathB[pathB.length - 1];

  if (pathB.includes(blockA)) return true;
  if (pathA.includes(blockB)) return true;
  return false;
}

function collectTextNodesFromHtml(html: string): TextNode[] {
  const nodes: TextNode[] = [];
  const stack: { tag: string; id: string }[] = [];
  let idCounter = 0;

  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  match = tagPattern.exec(html);
  while (match !== null) {
    if (match.index > lastIndex) {
      const text = decodeEntities(html.slice(lastIndex, match.index));
      if (text) {
        nodes.push({
          text,
          blockAncestorPath: getBlockAncestorPath(stack),
        });
      }
    }

    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = fullTag.startsWith("</");
    const isSelfClosing = fullTag.endsWith("/>") || isVoidElement(tagName);

    if (isClosing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagName) {
          stack.splice(i);
          break;
        }
      }
    } else if (!isSelfClosing) {
      stack.push({ tag: tagName, id: `e${idCounter++}` });
    }

    lastIndex = match.index + fullTag.length;
    match = tagPattern.exec(html);
  }

  if (lastIndex < html.length) {
    const text = decodeEntities(html.slice(lastIndex));
    if (text) {
      nodes.push({
        text,
        blockAncestorPath: getBlockAncestorPath(stack),
      });
    }
  }

  return nodes;
}

function getBlockAncestorPath(stack: { tag: string; id: string }[]): string[] {
  const path: string[] = [];
  for (const entry of stack) {
    if (BLOCK_ELEMENTS.has(entry.tag)) {
      path.push(entry.id);
    }
  }
  return path;
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, "\u00A0")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
}
