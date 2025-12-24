import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import type { Comment, CommentFile } from "../types";

const FORMAT_VERSION = 1;
const HASH_LENGTH = 16;
const MAX_SELECTION_LENGTH = 1000;
const TRUNCATION_MARKER = "\n...\n";
const ANCHOR_PREFIX_LENGTH = 200; // chars stored for anchor matching when text is truncated

/**
 * Truncate very long selections to first ~500 + ... + last ~500 chars.
 */
export function truncateSelection(text: string): string {
  if (text.length <= MAX_SELECTION_LENGTH) {
    return text;
  }
  const half = Math.floor(
    (MAX_SELECTION_LENGTH - TRUNCATION_MARKER.length) / 2,
  );
  return text.slice(0, half) + TRUNCATION_MARKER + text.slice(-half);
}

/**
 * Compute the path where comments for a source file should be stored.
 * Comments are stored in ~/.readit/comments/{absolute-path-structure}/{filename}.comments.md
 */
export function getCommentPath(sourcePath: string): string {
  // Resolve to absolute path
  const absolute = path.resolve(sourcePath);

  // Remove leading slash and drive letter (Windows)
  const normalized = absolute.replace(/^\//, "").replace(/^[A-Z]:[\\/]/, "");

  // Get filename without extension, add .comments.md
  const ext = path.extname(normalized);
  const withoutExt = normalized.slice(0, -ext.length || undefined);

  return path.join(
    os.homedir(),
    ".readit",
    "comments",
    `${withoutExt}.comments.md`,
  );
}

/**
 * Compute SHA-256 hash of content, returning first 16 characters.
 */
export function computeHash(content: string): string {
  return crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, HASH_LENGTH);
}

/**
 * Get line number (1-indexed) for a character offset in content.
 */
export function getLineNumber(content: string, offset: number): number {
  if (offset <= 0 || content.length === 0) return 1;
  const clampedOffset = Math.min(offset, content.length);
  return content.slice(0, clampedOffset).split("\n").length;
}

/**
 * Get line range string for a selection (e.g., "L42" or "L42-45").
 */
export function getLineHint(
  content: string,
  startOffset: number,
  endOffset: number,
): string {
  const startLine = getLineNumber(content, startOffset);
  const endLine = getLineNumber(content, endOffset);
  return startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;
}

/**
 * Parse a comment file's markdown content into a CommentFile structure.
 */
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

  // Parse YAML front matter
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontMatterMatch) {
    const frontMatter = frontMatterMatch[1];
    const sourceMatch = frontMatter.match(/^source:\s*(.+)$/m);
    const hashMatch = frontMatter.match(/^hash:\s*(.+)$/m);
    const versionMatch = frontMatter.match(/^version:\s*(\d+)$/m);

    if (sourceMatch) result.source = sourceMatch[1].trim();
    if (hashMatch) result.hash = hashMatch[1].trim();
    if (versionMatch) result.version = Number.parseInt(versionMatch[1], 10);

    // Validate version compatibility
    if (result.version > FORMAT_VERSION) {
      throw new Error(
        `Comment file requires readit v${result.version} or higher. ` +
          `Current version supports format v${FORMAT_VERSION}.`,
      );
    }
  }

  // Remove front matter and split by separator
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

/**
 * Parse a single comment block.
 */
function parseCommentBlock(block: string): Comment | undefined {
  // Extract metadata from HTML comment: <!-- c:{id}|{lineHint}|{timestamp} -->
  const metadataMatch = block.match(/<!--\s*c:([^|]+)\|([^|]+)\|([^>]+)\s*-->/);
  if (!metadataMatch) {
    return undefined;
  }

  const [, id, lineHint, createdAt] = metadataMatch;

  // Extract anchor prefix if present: <!-- anchor:{prefix} -->
  const anchorMatch = block.match(/<!--\s*anchor:(.+?)\s*-->/);
  const anchorPrefix = anchorMatch ? anchorMatch[1] : undefined;

  // Extract selected text from blockquote
  const blockquoteMatch = block.match(/^>\s*(.+(?:\n>\s*.+)*)$/m);
  if (!blockquoteMatch) {
    return undefined;
  }

  // Remove the "> " prefix from each line
  const selectedText = blockquoteMatch[1]
    .split("\n")
    .map((line) => line.replace(/^>\s*/, ""))
    .join("\n");

  // Extract comment body (everything after blockquote)
  const afterBlockquote = block.slice(
    block.indexOf(blockquoteMatch[0]) + blockquoteMatch[0].length,
  );
  const commentBody = afterBlockquote.trim();

  return {
    id,
    selectedText,
    comment: commentBody,
    createdAt: createdAt.trim(),
    lineHint,
    anchorPrefix,
    // Offsets will be resolved by anchor matching when loading
    startOffset: 0,
    endOffset: 0,
  };
}

/**
 * Serialize a CommentFile structure to markdown content.
 */
export function serializeComments(file: CommentFile): string {
  const lines: string[] = [];

  // YAML front matter
  lines.push("---");
  lines.push(`source: ${file.source}`);
  lines.push(`hash: ${file.hash}`);
  lines.push(`version: ${file.version}`);
  lines.push("---");
  lines.push("");

  // Comments
  for (const comment of file.comments) {
    lines.push(serializeComment(comment));
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Serialize a single comment to markdown block.
 */
function serializeComment(comment: Comment): string {
  const lines: string[] = [];

  // Metadata as HTML comment
  const lineHint = comment.lineHint || "L0";
  lines.push(`<!-- c:${comment.id}|${lineHint}|${comment.createdAt} -->`);

  // Anchor prefix for long selections (used for anchor matching when text is truncated)
  if (comment.anchorPrefix) {
    lines.push(`<!-- anchor:${comment.anchorPrefix} -->`);
  }

  // Selected text as blockquote
  const quotedLines = comment.selectedText
    .split("\n")
    .map((line) => `> ${line}`);
  lines.push(...quotedLines);

  // Comment body
  if (comment.comment) {
    lines.push("");
    lines.push(comment.comment);
  }

  return lines.join("\n");
}

/**
 * Create a new comment with a generated ID and current timestamp.
 */
export function createComment(
  selectedText: string,
  commentText: string,
  startOffset: number,
  endOffset: number,
  sourceContent: string,
): Comment {
  const id = crypto.randomUUID().slice(0, 8);
  const lineHint = getLineHint(sourceContent, startOffset, endOffset);
  const now = new Date();
  const createdAt = now.toISOString();

  const needsTruncation = selectedText.length > MAX_SELECTION_LENGTH;

  return {
    id,
    selectedText: truncateSelection(selectedText),
    comment: commentText,
    createdAt,
    startOffset,
    endOffset,
    lineHint,
    // Store first N chars for anchor matching when text is truncated
    anchorPrefix: needsTruncation
      ? selectedText.slice(0, ANCHOR_PREFIX_LENGTH)
      : undefined,
  };
}
