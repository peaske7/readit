/**
 * Codec for the `.comments.md` on-disk format.
 *
 * The format is the interface between this module and the Go server
 * (`go/internal/server/storage.go`): both must parse the same files into the
 * same comments and serialize the same comments into byte-identical output.
 * `fixtures/comments/` is the shared conformance corpus that pins that down.
 *
 * Caller-facing invariants:
 *
 * - **Offsets are not stored.** `startOffset`/`endOffset` are always `0` on a
 *   parsed comment. They only become meaningful after anchor resolution
 *   (`findAnchorWithFallback`), which matches `anchorPrefix ?? selectedText`.
 * - **`lineHint` is a hint, not a location.** Serialization writes `L0` when a
 *   comment has none; resolution treats a missing hint as `L1`. Never derive a
 *   position from it without resolving.
 * - **`hash` is written but never verified.** It records the source content the
 *   comments were last written against; a stale hash does not invalidate a file.
 * - **`id` is opaque**, 8 hex chars in practice, and must not contain `|` (it is
 *   delimited by `|` inside the marker comment).
 * - **Order is identity.** Parsing preserves file order and serialization writes
 *   it back unchanged. Merge and dedupe by `id`, never by position.
 * - **Serialization is pure.** Nothing is invented for missing fields: a comment
 *   without `createdAt` is written as a two-field marker, not stamped with now.
 * - **A comment body ending in `---` is not round-trippable**, because a bare
 *   `---` line is the comment separator.
 */
import * as crypto from "node:crypto";
import * as path from "node:path";
import type { Comment, CommentFile } from "../schema";
import { commentsDir } from "./readit-home.js";

const FORMAT_VERSION = 1;
const HASH_LENGTH = 16;
const MAX_SELECTION_LENGTH = 1000;
const TRUNCATION_MARKER = "\n...\n";
const ANCHOR_PREFIX_LENGTH = 200;

const MARKER_RE = /<!--\s*c:([^|]+)\|([^|>\s]+)(?:\|([^>]*))?\s*-->/;
const MARKER_GLOBAL_RE = new RegExp(MARKER_RE.source, "g");
const ANCHOR_RE = /<!--\s*anchor:(.*?)\s*-->/;
const TRAILING_SEPARATOR_RE = /\n+---\s*$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

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

  return path.join(commentsDir(), `${withoutExt}.comments.md`);
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

/**
 * The anchor prefix is stored as readable text on one line, so newlines,
 * backslashes and a literal `-->` are backslash-escaped.
 */
function escapeAnchorPrefix(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/-->/g, "--\\>");
}

const ANCHOR_UNESCAPES: Record<string, string> = {
  "\\": "\\",
  n: "\n",
  r: "\r",
  ">": ">",
};

function unescapeAnchorPrefix(text: string): string {
  return text.replace(
    /\\([\s\S])/g,
    (match, ch: string) => ANCHOR_UNESCAPES[ch] ?? match,
  );
}

/** Mirrors Go's unicode.IsControl, minus the whitespace the format allows. */
function hasControlChars(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    if (isControl && ch !== "\t" && ch !== "\n" && ch !== "\r") return true;
  }
  return false;
}

/**
 * readit <= 0.4 (Go server only) base64-encoded the anchor prefix. Raw text is
 * only ambiguous with base64 when it is pure base64 alphabet, correctly padded,
 * and decodes to printable UTF-8 — so that combination is read as legacy.
 */
function decodeAnchorPrefix(raw: string): string {
  if (raw.length % 4 === 0 && BASE64_RE.test(raw)) {
    try {
      const binary = atob(raw);
      const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded.length > 0 && !hasControlChars(decoded)) return decoded;
    } catch {
      // Not base64, or not UTF-8: fall through and read the value as raw text.
    }
  }
  return unescapeAnchorPrefix(raw);
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
    const sourceMatch = frontMatter.match(/^source:[ \t]*(.+)$/m);
    const hashMatch = frontMatter.match(/^hash:[ \t]*(.+)$/m);
    const versionMatch = frontMatter.match(/^version:[ \t]*(\d+)$/m);

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

  const markerStarts: number[] = [];
  for (const m of bodyContent.matchAll(MARKER_GLOBAL_RE)) {
    if (m.index !== undefined) markerStarts.push(m.index);
  }

  for (let i = 0; i < markerStarts.length; i++) {
    const start = markerStarts[i];
    const end =
      i + 1 < markerStarts.length ? markerStarts[i + 1] : bodyContent.length;
    const comment = parseCommentBlock(bodyContent.slice(start, end));
    if (comment) {
      result.comments.push(comment);
    }
  }

  return result;
}

function parseCommentBlock(rawBlock: string): Comment | undefined {
  const block = rawBlock.trim().replace(TRAILING_SEPARATOR_RE, "").trim();
  const metadataMatch = block.match(MARKER_RE);
  if (!metadataMatch) {
    return undefined;
  }

  const [, id, lineHint, createdAtRaw] = metadataMatch;
  const anchorMatch = block.match(ANCHOR_RE);

  const lines = block.split("\n");
  let i = 0;
  while (
    i < lines.length &&
    (MARKER_RE.test(lines[i]) || ANCHOR_RE.test(lines[i]))
  ) {
    i++;
  }

  const selectedLines: string[] = [];
  while (i < lines.length) {
    if (lines[i] === ">") {
      selectedLines.push("");
    } else if (lines[i].startsWith("> ")) {
      selectedLines.push(lines[i].slice(2));
    } else {
      break;
    }
    i++;
  }
  if (selectedLines.length === 0) {
    return undefined;
  }

  return {
    id: id.trim(),
    selectedText: selectedLines.join("\n"),
    comment: lines.slice(i).join("\n").trim(),
    lineHint: lineHint.trim(),
    createdAt: createdAtRaw?.trim() || undefined,
    anchorPrefix: anchorMatch ? decodeAnchorPrefix(anchorMatch[1]) : undefined,
    startOffset: 0,
    endOffset: 0,
  };
}

/** Never leaves a trailing space behind an empty value. */
function frontMatterLine(key: string, value: string): string {
  return value ? `${key}: ${value}` : `${key}:`;
}

export function serializeComments(file: CommentFile): string {
  const lines: string[] = [
    "---",
    frontMatterLine("source", file.source),
    frontMatterLine("hash", file.hash),
    `version: ${file.version}`,
    "---",
    "",
  ];

  for (const comment of file.comments) {
    const lineHint = comment.lineHint || "L0";
    lines.push(
      comment.createdAt
        ? `<!-- c:${comment.id}|${lineHint}|${comment.createdAt} -->`
        : `<!-- c:${comment.id}|${lineHint} -->`,
    );

    if (comment.anchorPrefix) {
      lines.push(`<!-- anchor:${escapeAnchorPrefix(comment.anchorPrefix)} -->`);
    }

    for (const line of comment.selectedText.split("\n")) {
      lines.push(line ? `> ${line}` : ">");
    }

    const body = comment.comment.trim();
    if (body) {
      lines.push("", body);
    }

    lines.push("", "---", "");
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
    createdAt: new Date().toISOString(),
    anchorPrefix: needsTruncation
      ? selectedText.slice(0, ANCHOR_PREFIX_LENGTH)
      : undefined,
  };
}
