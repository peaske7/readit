import {
  computeHash,
  createComment,
  getLineHint,
  parseCommentFile,
  serializeComments,
  truncateSelection,
} from "../../src/lib/comment-storage";
import { resolveComments } from "../../src/lib/resolve-comments";
import {
  type ShareMeta,
  type ShareSnapshot,
  shareFilePath,
  sharePath,
} from "../../src/lib/share-snapshot";
import { AnchorConfidences, type Comment } from "../../src/schema";
import type { Env } from "./env";
import { errorResponse, errorWithDetail, json } from "./http";
import { readSnapshot, writeComments } from "./store";

const COMMENT_ROUTE = /^\/comments\/([A-Za-z0-9-]+)(\/reanchor)?$/;

// A comment is a selection plus a note; anything near this is not one.
const MAX_BODY_BYTES = 64 * 1024;

/** Parse a JSON body, or return undefined when it exceeds MAX_BODY_BYTES. */
async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | undefined> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return undefined;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    return undefined;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/**
 * Offsets index the rendered text, which is never longer than the HTML it
 * came from, so that bounds them without knowing the exact text length.
 */
function parseOffsetRange(
  start: unknown,
  end: unknown,
  max: number,
): { start: number; end: number } | undefined {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return undefined;
  const s = start as number;
  const e = end as number;
  if (s < 0 || s > e || e > max) return undefined;
  return { start: s, end: e };
}

/**
 * Viewer-facing API under /s/{id}/api, mirroring the local server's
 * /api/document and /api/comments handlers so the Svelte app is unchanged.
 * The `path` query the app sends is ignored: a share holds one document.
 */
export async function handleShareComments(
  request: Request,
  env: Env,
  meta: ShareMeta,
  route: string,
): Promise<Response> {
  const snapshot = await readSnapshot(env.SHARES, meta.id);
  if (!snapshot) return errorResponse("Share has no content yet", 404);

  const method = request.method;
  const filePath = shareFilePath(meta.id, meta.fileName);

  try {
    if (route === "/document" && method === "GET") {
      return json({
        html: snapshot.html,
        headings: meta.headings,
        filePath,
        fileName: meta.fileName,
        clean: false,
      });
    }

    // Resolve first, as the local server does, so responses carry offsets.
    const stored = resolveComments({
      comments: snapshot.comments
        ? parseCommentFile(snapshot.comments).comments
        : [],
      source: snapshot.source,
      html: snapshot.html,
    });
    const save = (comments: Comment[]) =>
      saveComments(env, meta, snapshot, filePath, comments);

    if (route === "/comments" && method === "GET") {
      return json({ comments: stored });
    }
    if (route === "/comments/raw" && method === "GET") {
      return json({
        content: snapshot.comments ?? null,
        path: `${sharePath(meta.id)}/comments.md`,
      });
    }
    if (route === "/comments" && method === "POST") {
      const body = await readJsonBody(request);
      if (!body) return errorResponse("Request body too large", 413);
      const { selectedText, comment, startOffset, endOffset } = body;
      const range = parseOffsetRange(
        startOffset,
        endOffset,
        snapshot.html.length,
      );
      if (
        typeof selectedText !== "string" ||
        !selectedText ||
        typeof comment !== "string" ||
        !range
      ) {
        return errorResponse("Missing required fields", 400);
      }
      const created = createComment(
        selectedText,
        comment,
        range.start,
        range.end,
        snapshot.source,
      );
      await save([...stored, created]);
      return json({ comment: created }, 201);
    }
    if (route === "/comments" && method === "DELETE") {
      await save([]);
      return json({ success: true });
    }

    const match = route.match(COMMENT_ROUTE);
    if (!match) return errorResponse("Not found", 404);
    const [, id, reanchor] = match;
    const index = stored.findIndex((c) => c.id === id);
    if (index === -1) return errorResponse("Comment not found", 404);

    if (reanchor && method === "PUT") {
      const body = await readJsonBody(request);
      if (!body) return errorResponse("Request body too large", 413);
      const { selectedText, startOffset, endOffset } = body;
      const range = parseOffsetRange(
        startOffset,
        endOffset,
        snapshot.html.length,
      );
      if (typeof selectedText !== "string" || !selectedText || !range) {
        return errorResponse("Missing required fields", 400);
      }
      const updated: Comment = {
        ...stored[index],
        selectedText: truncateSelection(selectedText),
        startOffset: range.start,
        endOffset: range.end,
        lineHint: getLineHint(snapshot.source, range.start, range.end),
        anchorConfidence: AnchorConfidences.EXACT,
        anchorPrefix:
          selectedText.length > 1000 ? selectedText.slice(0, 200) : undefined,
      };
      await save(stored.map((c, i) => (i === index ? updated : c)));
      return json({ comment: updated });
    }
    if (method === "PUT") {
      const body = await readJsonBody(request);
      if (!body) return errorResponse("Request body too large", 413);
      const { comment } = body;
      if (typeof comment !== "string") {
        return errorResponse("Missing comment text", 400);
      }
      const updated = { ...stored[index], comment: comment.trim() };
      await save(stored.map((c, i) => (i === index ? updated : c)));
      return json({ comment: updated });
    }
    if (method === "DELETE") {
      await save(stored.filter((c) => c.id !== id));
      return json({ success: true });
    }
    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("share comments error:", err);
    return errorWithDetail("Comment operation failed", err);
  }
}

/** Persist as a canonical `.comments.md`; an empty list removes the object. */
function saveComments(
  env: Env,
  meta: ShareMeta,
  snapshot: ShareSnapshot,
  filePath: string,
  comments: Comment[],
): Promise<void> {
  const content =
    comments.length === 0
      ? undefined
      : serializeComments({
          source: filePath,
          hash: computeHash(snapshot.source),
          version: 1,
          comments,
        });
  return writeComments(env.SHARES, meta.id, content);
}
