import { extractTextFromHtml } from "./html-text";

interface ContextResult {
  lines: string[];
  startLine: number;
  endLine: number;
}

interface FormatOptions {
  context: ContextResult;
  fileName: string;
  comment?: string;
}

export interface ExtractContextParams {
  content: string;
  startOffset: number;
  endOffset: number;
  contextLines?: number;
}

const DEFAULT_CONTEXT_LINES = 2;
const MAX_SELECTION_LINES = 10;
const MAX_LINE_LENGTH = 200;

function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

function truncateLine(line: string, maxLength = MAX_LINE_LENGTH): string {
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength - 3)}...`;
}

export function extractContext({
  content,
  startOffset,
  endOffset,
  contextLines = DEFAULT_CONTEXT_LINES,
}: ExtractContextParams): ContextResult {
  const textContent = isHtml(content) ? extractTextFromHtml(content) : content;
  const normalizedContent = textContent.replace(/\r\n/g, "\n");

  const lines = normalizedContent.split("\n");
  let currentOffset = 0;
  let startLineIndex = -1;
  let endLineIndex = -1;
  let startCharInLine = 0;
  let endCharInLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineLength = lines[i].length;
    const lineEnd = currentOffset + lineLength;

    if (startLineIndex === -1 && lineEnd >= startOffset) {
      startLineIndex = i;
      startCharInLine = startOffset - currentOffset;
    }

    if (lineEnd >= endOffset) {
      endLineIndex = i;
      endCharInLine = endOffset - currentOffset;
      break;
    }

    currentOffset += lineLength + 1;
  }

  if (startLineIndex === -1) startLineIndex = 0;
  if (endLineIndex === -1) endLineIndex = lines.length - 1;

  const contextStart = Math.max(0, startLineIndex - contextLines);
  const contextEnd = Math.min(lines.length - 1, endLineIndex + contextLines);

  const outputLines: string[] = [];
  const selectionSpan = endLineIndex - startLineIndex + 1;
  const shouldTruncateMiddle = selectionSpan > MAX_SELECTION_LINES;

  for (let i = contextStart; i <= contextEnd; i++) {
    let line = lines[i];

    if (shouldTruncateMiddle) {
      const showStart = startLineIndex + 2;
      const showEnd = endLineIndex - 2;

      if (i > showStart && i < showEnd) {
        if (i === showStart + 1) {
          outputLines.push("...");
        }
        continue;
      }
    }

    if (i === startLineIndex && i === endLineIndex) {
      const before = line.slice(0, startCharInLine);
      const selected = line.slice(startCharInLine, endCharInLine);
      const after = line.slice(endCharInLine);
      line = `${before}>>> ${selected} <<<${after}`;
    } else if (i === startLineIndex) {
      const before = line.slice(0, startCharInLine);
      const selected = line.slice(startCharInLine);
      line = `${before}>>> ${selected}`;
    } else if (i === endLineIndex) {
      const selected = line.slice(0, endCharInLine);
      const after = line.slice(endCharInLine);
      line = `${selected} <<<${after}`;
    }

    outputLines.push(truncateLine(line));
  }

  return {
    lines: outputLines,
    startLine: startLineIndex + 1,
    endLine: endLineIndex + 1,
  };
}

export function formatForLLM({
  context,
  fileName,
  comment,
}: FormatOptions): string {
  const header = `# From: ${fileName}`;
  const lineRange = `Lines ${context.startLine}-${context.endLine}:`;
  const body = ["---", ...context.lines, "---"].join("\n");

  const parts = [header, "", lineRange, body];

  if (comment) {
    parts.push("", `Comment: ${comment}`);
  }

  return parts.join("\n");
}
