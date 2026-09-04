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
      const body = await request.json<Record<string, unknown>>();
      const { selectedText, comment, startOffset, endOffset } = body;
      if (
        typeof selectedText !== "string" ||
        !selectedText ||
        typeof comment !== "string" ||
        typeof startOffset !== "number" ||
        typeof endOffset !== "number"
      ) {
        return errorResponse("Missing required fields", 400);
      }
      const created = createComment(
        selectedText,
        comment,
        startOffset,
        endOffset,
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
      const body = await request.json<Record<string, unknown>>();
      const { selectedText, startOffset, endOffset } = body;
      if (
        typeof selectedText !== "string" ||
        !selectedText ||
        typeof startOffset !== "number" ||
        typeof endOffset !== "number"
      ) {
        return errorResponse("Missing required fields", 400);
      }
      const updated: Comment = {
        ...stored[index],
        selectedText: truncateSelection(selectedText),
        startOffset,
        endOffset,
        lineHint: getLineHint(snapshot.source, startOffset, endOffset),
        anchorConfidence: AnchorConfidences.EXACT,
        anchorPrefix:
          selectedText.length > 1000 ? selectedText.slice(0, 200) : undefined,
      };
      await save(stored.map((c, i) => (i === index ? updated : c)));
      return json({ comment: updated });
    }
    if (method === "PUT") {
      const { comment } = await request.json<Record<string, unknown>>();
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
