import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import type { Comment, CommentFile } from "../schema";

const FORMAT_VERSION = 1;
const HASH_LENGTH = 16;
const MAX_SELECTION_LENGTH = 1000;
const TRUNCATION_MARKER = "\n...\n";
const ANCHOR_PREFIX_LENGTH = 200; // chars stored for anchor matching when text is truncated

export function truncateSelection(text: string): string {
  if (text.length <= MAX_SELECTION_LENGTH) {
    return text;
  }
  const half = Math.floor(
    (MAX_SELECTION_LENGTH - TRUNCATION_MARKER.length) / 2,
  );
  return text.slice(0, half) + TRUNCATION_MARKER + text.slice(-half);
}

export function getCommentPath(sourcePath: string): string {
  const absolute = path.resolve(sourcePath);
  const normalized = absolute.replace(/^\//, "").replace(/^[A-Z]:[\\/]/, "");
  const ext = path.extname(normalized);
  const withoutExt = normalized.slice(0, -ext.length || undefined);

  return path.join(
    os.homedir(),
    ".readit",
    "comments",
    `${withoutExt}.comments.md`,
  );
}

export function computeHash(content: string): string {
  return crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, HASH_LENGTH);
}

export function getLineNumber(content: string, offset: number): number {
  if (offset <= 0 || content.length === 0) return 1;
  const clampedOffset = Math.min(offset, content.length);
  return content.slice(0, clampedOffset).split("\n").length;
}

export function getLineHint(
  content: string,
  startOffset: number,
  endOffset: number,
): string {
  const startLine = getLineNumber(content, startOffset);
  const endLine = getLineNumber(content, endOffset);
  return startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`;
}

export function parseCommentFile(content: string): CommentFile {
  const result: CommentFile = {
    source: "",
    hash: "",
    version: FORMAT_VERSION,
    comments: [],
  };

  if (!content.trim()) {
    return result;
  }

  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontMatterMatch) {
    const frontMatter = frontMatterMatch[1];
    const sourceMatch = frontMatter.match(/^source:\s*(.+)$/m);
    const hashMatch = frontMatter.match(/^hash:\s*(.+)$/m);
    const versionMatch = frontMatter.match(/^version:\s*(\d+)$/m);

    if (sourceMatch) result.source = sourceMatch[1].trim();
    if (hashMatch) result.hash = hashMatch[1].trim();
    if (versionMatch) result.version = Number.parseInt(versionMatch[1], 10);

    if (result.version > FORMAT_VERSION) {
      throw new Error(
        `Comment file requires readit v${result.version} or higher. ` +
          `Current version supports format v${FORMAT_VERSION}.`,
      );
    }
  }

  const bodyContent = content.replace(/^---\n[\s\S]*?\n---\n*/, "");
  const blocks = bodyContent.split(/\n---\n/).filter((block) => block.trim());

  for (const block of blocks) {
    const comment = parseCommentBlock(block);
    if (comment) {
      result.comments.push(comment);
    }
  }

  return result;
}

function parseCommentBlock(block: string): Comment | undefined {
  // Extract metadata from HTML comment: <!-- c:{id}|{lineHint} -->
  const metadataMatch = block.match(
    /<!--\s*c:([^|]+)\|([^|>\s]+)(?:\|[^>]*)?\s*-->/,
  );
  if (!metadataMatch) {
    return undefined;
  }

  const [, id, lineHint] = metadataMatch;

  const anchorMatch = block.match(/<!--\s*anchor:(.+?)\s*-->/);
  const anchorPrefix = anchorMatch ? anchorMatch[1] : undefined;

  const blockquoteMatch = block.match(/^>\s*(.+(?:\n>\s*.+)*)$/m);
  if (!blockquoteMatch) {
    return undefined;
  }

  const selectedText = blockquoteMatch[1]
    .split("\n")
    .map((line) => line.replace(/^>\s*/, ""))
    .join("\n");

  const afterBlockquote = block.slice(
    block.indexOf(blockquoteMatch[0]) + blockquoteMatch[0].length,
  );
  const commentBody = afterBlockquote.trim();

  return {
    id,
    selectedText,
    comment: commentBody,
    lineHint,
    anchorPrefix,
    startOffset: 0,
    endOffset: 0,
  };
}

export function serializeComments(file: CommentFile): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`source: ${file.source}`);
  lines.push(`hash: ${file.hash}`);
  lines.push(`version: ${file.version}`);
  lines.push("---");
  lines.push("");

  for (const comment of file.comments) {
    lines.push(serializeComment(comment));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function serializeComment(comment: Comment): string {
  const lines: string[] = [];

  const lineHint = comment.lineHint || "L0";
  lines.push(`<!-- c:${comment.id}|${lineHint} -->`);

  if (comment.anchorPrefix) {
    lines.push(`<!-- anchor:${comment.anchorPrefix} -->`);
  }

  const quotedLines = comment.selectedText
    .split("\n")
    .map((line) => `> ${line}`);
  lines.push(...quotedLines);

  if (comment.comment) {
    lines.push("");
    lines.push(comment.comment);
  }

  return lines.join("\n");
}

export function createComment(
  selectedText: string,
  commentText: string,
  startOffset: number,
  endOffset: number,
  sourceContent: string,
): Comment {
  const id = crypto.randomUUID().slice(0, 8);
  const lineHint = getLineHint(sourceContent, startOffset, endOffset);

  const needsTruncation = selectedText.length > MAX_SELECTION_LENGTH;

  return {
    id,
    selectedText: truncateSelection(selectedText),
    comment: commentText,
    startOffset,
    endOffset,
    lineHint,
    anchorPrefix: needsTruncation
      ? selectedText.slice(0, ANCHOR_PREFIX_LENGTH)
      : undefined,
  };
}
