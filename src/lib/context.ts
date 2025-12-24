/**
 * Context extraction and formatting utilities for LLM clipboard copy.
 */

interface ContextResult {
  lines: string[]; // Lines with >>> markers inserted
  startLine: number; // 1-based line number
  endLine: number; // 1-based line number
}

interface FormatOptions {
  context: ContextResult;
  fileName: string;
  comment?: string;
}

const DEFAULT_CONTEXT_LINES = 2;
const MAX_SELECTION_LINES = 10;
const MAX_LINE_LENGTH = 200;

/**
 * Strip HTML tags to get plain text matching TreeWalker offset calculation.
 */
export function stripHtmlTags(html: string): string {
  // Remove script/style content entirely
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common named entities
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  // Decode numeric entities (decimal and hex)
  text = text.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 10)),
  );
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
  return text;
}

/**
 * Detect if content is HTML based on presence of HTML tags.
 */
function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

/**
 * Truncate a line if it exceeds max length.
 */
function truncateLine(
  line: string,
  maxLength: number = MAX_LINE_LENGTH,
): string {
  if (line.length <= maxLength) return line;
  return `${line.slice(0, maxLength - 3)}...`;
}

/**
 * Extract context around a selection using character offsets.
 * Returns lines with >>> and <<< markers inserted at selection boundaries.
 */
export function extractContext(
  content: string,
  startOffset: number,
  endOffset: number,
  contextLines: number = DEFAULT_CONTEXT_LINES,
): ContextResult {
  // For HTML, strip tags to match offset calculation
  const textContent = isHtml(content) ? stripHtmlTags(content) : content;
  // Normalize CRLF to LF for consistent offset calculation
  const normalizedContent = textContent.replace(/\r\n/g, "\n");

  const lines = normalizedContent.split("\n");
  let currentOffset = 0;
  let startLineIndex = -1;
  let endLineIndex = -1;
  let startCharInLine = 0;
  let endCharInLine = 0;

  // Find lines containing the selection
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

    currentOffset += lineLength + 1; // +1 for newline
  }

  // Handle edge case: couldn't find lines
  if (startLineIndex === -1) startLineIndex = 0;
  if (endLineIndex === -1) endLineIndex = lines.length - 1;

  // Calculate context range
  const contextStart = Math.max(0, startLineIndex - contextLines);
  const contextEnd = Math.min(lines.length - 1, endLineIndex + contextLines);

  // Build output lines with markers
  const outputLines: string[] = [];
  const selectionSpan = endLineIndex - startLineIndex + 1;
  const shouldTruncateMiddle = selectionSpan > MAX_SELECTION_LINES;

  for (let i = contextStart; i <= contextEnd; i++) {
    let line = lines[i];

    // Handle truncation for very long selections
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

    // Insert markers for selection boundaries
    if (i === startLineIndex && i === endLineIndex) {
      // Single line selection
      const before = line.slice(0, startCharInLine);
      const selected = line.slice(startCharInLine, endCharInLine);
      const after = line.slice(endCharInLine);
      line = `${before}>>> ${selected} <<<${after}`;
    } else if (i === startLineIndex) {
      // Start of multi-line selection
      const before = line.slice(0, startCharInLine);
      const selected = line.slice(startCharInLine);
      line = `${before}>>> ${selected}`;
    } else if (i === endLineIndex) {
      // End of multi-line selection
      const selected = line.slice(0, endCharInLine);
      const after = line.slice(endCharInLine);
      line = `${selected} <<<${after}`;
    }

    outputLines.push(truncateLine(line));
  }

  return {
    lines: outputLines,
    startLine: startLineIndex + 1, // 1-based
    endLine: endLineIndex + 1, // 1-based
  };
}

/**
 * Format extracted context for LLM clipboard copy.
 */
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
