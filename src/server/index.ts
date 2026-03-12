import { type FSWatcher, watch } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { basename, dirname, join } from "node:path";
import { findAnchorWithFallback } from "../lib/anchor.js";
import {
  computeHash,
  createComment,
  getCommentPath,
  getLineHint,
  parseCommentFile,
  serializeComments,
  truncateSelection,
} from "../lib/comment-storage.js";
import {
  AnchorConfidences,
  type Comment,
  type DocumentSettings,
  type DocumentType,
  FontFamilies,
  type FontFamily,
} from "../types/index.js";

// ─── Helpers (unchanged from Express version) ───────────────────────

/**
 * Type predicate for NodeJS file system errors.
 */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

export interface ServerOptions {
  content: string;
  type: DocumentType;
  filePath: string;
  port: number;
  host: string;
  clean?: boolean;
}

export interface ServerResult {
  port: number;
  url: string;
  server: { stop(): void };
}

/**
 * Read comments from file, resolving anchors against source content.
 */
async function readCommentsFromFile(
  filePath: string,
  sourceContent: string,
): Promise<Comment[]> {
  const commentPath = getCommentPath(filePath);

  try {
    const content = await fs.readFile(commentPath, "utf-8");
    const file = parseCommentFile(content);

    return file.comments.map((comment) => {
      const textForMatching = comment.anchorPrefix || comment.selectedText;
      const anchor = findAnchorWithFallback({
        source: sourceContent,
        selectedText: textForMatching,
        lineHint: comment.lineHint || "L1",
      });

      if (anchor) {
        return {
          ...comment,
          startOffset: anchor.start,
          endOffset: anchor.end,
          lineHint: `L${anchor.line}`,
          anchorConfidence: anchor.confidence,
        };
      }

      return {
        ...comment,
        anchorConfidence: AnchorConfidences.UNRESOLVED,
      };
    });
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

async function writeCommentsToFile(
  filePath: string,
  sourceContent: string,
  comments: Comment[],
): Promise<void> {
  const commentPath = getCommentPath(filePath);
  const commentDir = dirname(commentPath);

  await fs.mkdir(commentDir, { recursive: true });

  const file = {
    source: filePath,
    hash: computeHash(sourceContent),
    version: 1,
    comments,
  };

  const content = serializeComments(file);
  const tempPath = `${commentPath}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, commentPath);
}

async function deleteCommentFile(filePath: string): Promise<void> {
  const commentPath = getCommentPath(filePath);
  try {
    await fs.unlink(commentPath);
  } catch (err) {
    if (!isErrnoException(err) || err.code !== "ENOENT") {
      throw err;
    }
  }
}

/**
 * Compute settings file path for a source file.
 */
function getSettingsPath(sourcePath: string): string {
  const absolute = path.resolve(sourcePath);
  const normalized = absolute.replace(/^\//, "").replace(/^[A-Z]:[\\/]/, "");
  return path.join(
    os.homedir(),
    ".readit",
    "settings",
    `${normalized}.settings.json`,
  );
}

const DEFAULT_SETTINGS: DocumentSettings = {
  version: 1,
  fontFamily: FontFamilies.SERIF,
};

async function readSettingsFromFile(
  filePath: string,
): Promise<DocumentSettings> {
  const settingsPath = getSettingsPath(filePath);
  try {
    const content = await fs.readFile(settingsPath, "utf-8");
    return JSON.parse(content) as DocumentSettings;
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      return DEFAULT_SETTINGS;
    }
    throw err;
  }
}

async function writeSettingsToFile(
  filePath: string,
  settings: DocumentSettings,
): Promise<void> {
  const settingsPath = getSettingsPath(filePath);
  const settingsDir = dirname(settingsPath);

  await fs.mkdir(settingsDir, { recursive: true });

  const tempPath = `${settingsPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), "utf-8");
  await fs.rename(tempPath, settingsPath);
}

function isValidFontFamily(value: unknown): value is FontFamily {
  return value === FontFamilies.SERIF || value === FontFamilies.SANS_SERIF;
}

// ─── Response helpers ───────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

// ─── Route context ──────────────────────────────────────────────────

interface RouteContext {
  filePath: string;
  getCurrentContent: () => string;
}

// ─── Route handlers ─────────────────────────────────────────────────

async function getComments(ctx: RouteContext): Promise<Response> {
  try {
    const comments = await readCommentsFromFile(
      ctx.filePath,
      ctx.getCurrentContent(),
    );
    return json({ comments });
  } catch (err) {
    console.error("Failed to read comments:", err);
    return errorResponse("Failed to read comments", 500);
  }
}

async function addComment(ctx: RouteContext, req: Request): Promise<Response> {
  try {
    const {
      selectedText,
      comment: commentText,
      startOffset,
      endOffset,
    } = await req.json();

    if (
      !selectedText ||
      typeof commentText !== "string" ||
      startOffset === undefined ||
      endOffset === undefined
    ) {
      return errorResponse("Missing required fields", 400);
    }

    const currentContent = ctx.getCurrentContent();
    const newComment = createComment(
      selectedText,
      commentText,
      startOffset,
      endOffset,
      currentContent,
    );

    const existingComments = await readCommentsFromFile(
      ctx.filePath,
      currentContent,
    );
    const allComments = [...existingComments, newComment];

    await writeCommentsToFile(ctx.filePath, currentContent, allComments);

    return json({ comment: newComment }, 201);
  } catch (err) {
    console.error("Failed to add comment:", err);
    return errorResponse("Failed to add comment", 500);
  }
}

async function updateComment(
  ctx: RouteContext,
  req: Request,
  id: string,
): Promise<Response> {
  try {
    const { comment: commentText } = await req.json();

    if (typeof commentText !== "string") {
      return errorResponse("Missing comment text", 400);
    }

    const currentContent = ctx.getCurrentContent();
    const existingComments = await readCommentsFromFile(
      ctx.filePath,
      currentContent,
    );
    const commentIndex = existingComments.findIndex((c) => c.id === id);

    if (commentIndex === -1) {
      return errorResponse("Comment not found", 404);
    }

    const updatedComments = existingComments.map((c, i) =>
      i === commentIndex ? { ...c, comment: commentText.trim() } : c,
    );

    await writeCommentsToFile(ctx.filePath, currentContent, updatedComments);

    return json({ comment: updatedComments[commentIndex] });
  } catch (err) {
    console.error("Failed to update comment:", err);
    return errorResponse("Failed to update comment", 500);
  }
}

async function deleteComment(ctx: RouteContext, id: string): Promise<Response> {
  try {
    const currentContent = ctx.getCurrentContent();
    const existingComments = await readCommentsFromFile(
      ctx.filePath,
      currentContent,
    );
    const filteredComments = existingComments.filter((c) => c.id !== id);

    if (filteredComments.length === existingComments.length) {
      return errorResponse("Comment not found", 404);
    }

    if (filteredComments.length === 0) {
      await deleteCommentFile(ctx.filePath);
    } else {
      await writeCommentsToFile(ctx.filePath, currentContent, filteredComments);
    }

    return json({ success: true });
  } catch (err) {
    console.error("Failed to delete comment:", err);
    return errorResponse("Failed to delete comment", 500);
  }
}

async function clearComments(ctx: RouteContext): Promise<Response> {
  try {
    await deleteCommentFile(ctx.filePath);
    return json({ success: true });
  } catch (err) {
    console.error("Failed to clear comments:", err);
    return errorResponse("Failed to clear comments", 500);
  }
}

async function getRawComments(ctx: RouteContext): Promise<Response> {
  const commentPath = getCommentPath(ctx.filePath);
  try {
    const content = await fs.readFile(commentPath, "utf-8");
    return json({ content, path: commentPath });
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      return json({ content: null, path: commentPath });
    }
    console.error("Failed to read raw comments:", err);
    return errorResponse("Failed to read raw comments", 500);
  }
}

async function reanchorComment(
  ctx: RouteContext,
  req: Request,
  id: string,
): Promise<Response> {
  try {
    const { selectedText, startOffset, endOffset } = await req.json();

    if (!selectedText || startOffset === undefined || endOffset === undefined) {
      return errorResponse("Missing required fields", 400);
    }

    const currentContent = ctx.getCurrentContent();
    const existingComments = await readCommentsFromFile(
      ctx.filePath,
      currentContent,
    );
    const commentIndex = existingComments.findIndex((c) => c.id === id);

    if (commentIndex === -1) {
      return errorResponse("Comment not found", 404);
    }

    const lineHint = getLineHint(currentContent, startOffset, endOffset);
    const truncatedText = truncateSelection(selectedText);

    const updatedComment: Comment = {
      ...existingComments[commentIndex],
      selectedText: truncatedText,
      startOffset,
      endOffset,
      lineHint,
      anchorConfidence: AnchorConfidences.EXACT,
      anchorPrefix:
        selectedText.length > 1000 ? selectedText.slice(0, 200) : undefined,
    };

    const updatedComments = existingComments.map((c, i) =>
      i === commentIndex ? updatedComment : c,
    );

    await writeCommentsToFile(ctx.filePath, currentContent, updatedComments);

    return json({ comment: updatedComment });
  } catch (err) {
    console.error("Failed to re-anchor comment:", err);
    return errorResponse("Failed to re-anchor comment", 500);
  }
}

async function getSettings(ctx: RouteContext): Promise<Response> {
  try {
    const settings = await readSettingsFromFile(ctx.filePath);
    return json(settings);
  } catch (err) {
    console.error("Failed to read settings:", err);
    return errorResponse("Failed to read settings", 500);
  }
}

async function updateSettings(
  ctx: RouteContext,
  req: Request,
): Promise<Response> {
  try {
    const { fontFamily } = await req.json();

    if (!isValidFontFamily(fontFamily)) {
      return errorResponse("Invalid font family", 400);
    }

    const settings: DocumentSettings = {
      version: 1,
      fontFamily,
    };

    await writeSettingsToFile(ctx.filePath, settings);
    return json(settings);
  } catch (err) {
    console.error("Failed to save settings:", err);
    return errorResponse("Failed to save settings", 500);
  }
}

// ─── SSE helpers ────────────────────────────────────────────────────

function createDocumentStream(
  sseClients: Set<ReadableStreamDefaultController>,
): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue("data: connected\n\n");
      sseClients.add(controller);
    },
    cancel(controller) {
      sseClients.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function createHeartbeat(isDev: boolean): Response {
  let interval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue("data: connected\n\n");
      interval = setInterval(() => {
        try {
          controller.enqueue("data: ping\n\n");
        } catch {
          clearInterval(interval);
        }
      }, 5000);
    },
    cancel() {
      clearInterval(interval);
      if (isDev) return;
      setTimeout(() => {
        console.log("\nBrowser disconnected, shutting down...");
        process.exit(0);
      }, 100);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── Static file serving ────────────────────────────────────────────

async function serveStaticFile(
  distPath: string,
  pathname: string,
): Promise<Response> {
  // Try the exact file path first
  const filePath = join(distPath, pathname);
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return new Response(file);
  }

  // SPA fallback: serve index.html for non-API routes
  const indexFile = Bun.file(join(distPath, "index.html"));
  if (await indexFile.exists()) {
    return new Response(indexFile);
  }

  return new Response("Not Found", { status: 404 });
}

// ─── Extract route param ────────────────────────────────────────────

function extractCommentId(pathname: string): string | undefined {
  // Match /api/comments/:id or /api/comments/:id/reanchor
  const match = pathname.match(/^\/api\/comments\/([^/]+)/);
  return match?.[1];
}

// ─── Server creation ────────────────────────────────────────────────

interface ServerWithWatcher {
  server: ReturnType<typeof Bun.serve>;
  watcher: FSWatcher | null;
}

function createServer(options: ServerOptions): ServerWithWatcher {
  let currentContent = options.content;
  const sseClients = new Set<ReadableStreamDefaultController>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(options.filePath, async (eventType) => {
      if (eventType !== "change") return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const newContent = await fs.readFile(options.filePath, "utf-8");
          if (newContent !== currentContent) {
            currentContent = newContent;
            console.log("File changed, notifying clients...");
            for (const controller of sseClients) {
              try {
                controller.enqueue("data: update\n\n");
              } catch {
                sseClients.delete(controller);
              }
            }
          }
        } catch (err) {
          console.error("Failed to read updated file:", err);
        }
      }, 100);
    });
  } catch (err) {
    console.warn("File watching not available:", err);
  }

  const isDev = process.env.NODE_ENV === "development";
  const distPath = import.meta.dir;

  const ctx: RouteContext = {
    filePath: options.filePath,
    getCurrentContent: () => currentContent,
  };

  const server = Bun.serve({
    port: options.port,
    hostname: options.host,

    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      const method = req.method;

      // ── API routes ──────────────────────────────────────────

      if (pathname === "/api/document" && method === "GET") {
        return json({
          content: currentContent,
          type: options.type,
          filePath: options.filePath,
          fileName: basename(options.filePath),
          clean: options.clean || false,
        });
      }

      if (pathname === "/api/document/stream" && method === "GET") {
        return createDocumentStream(sseClients);
      }

      if (pathname === "/api/health" && method === "GET") {
        return json({ status: "ok" });
      }

      if (pathname === "/api/heartbeat" && method === "GET") {
        return createHeartbeat(isDev);
      }

      // Comments routes
      if (pathname === "/api/comments" && method === "GET") {
        return getComments(ctx);
      }

      if (pathname === "/api/comments/raw" && method === "GET") {
        return getRawComments(ctx);
      }

      if (pathname === "/api/comments" && method === "POST") {
        return addComment(ctx, req);
      }

      if (pathname === "/api/comments" && method === "DELETE") {
        return clearComments(ctx);
      }

      // Parameterized comment routes
      const commentId = extractCommentId(pathname);
      if (commentId) {
        if (pathname.endsWith("/reanchor") && method === "PUT") {
          return reanchorComment(ctx, req, commentId);
        }
        if (method === "PUT") {
          return updateComment(ctx, req, commentId);
        }
        if (method === "DELETE") {
          return deleteComment(ctx, commentId);
        }
      }

      // Settings routes
      if (pathname === "/api/settings" && method === "GET") {
        return getSettings(ctx);
      }

      if (pathname === "/api/settings" && method === "PUT") {
        return updateSettings(ctx, req);
      }

      // ── Static / SPA serving ────────────────────────────────

      if (isDev && pathname === "/") {
        return Response.redirect("http://localhost:5173", 302);
      }

      if (!isDev) {
        return serveStaticFile(distPath, pathname);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return { server, watcher };
}

// ─── Port fallback + start ──────────────────────────────────────────

export async function startServer(
  options: ServerOptions,
): Promise<ServerResult> {
  const MAX_PORT = 65535;

  for (let port = options.port; port <= MAX_PORT; port++) {
    try {
      const { server, watcher } = createServer({ ...options, port });

      const displayHost =
        options.host === "0.0.0.0" ? "localhost" : options.host;

      // Clean up watcher when server stops
      const originalStop = server.stop.bind(server);
      const wrappedServer = {
        stop() {
          watcher?.close();
          originalStop();
        },
      };

      const actualPort = server.port ?? port;

      return {
        port: actualPort,
        url: `http://${displayHost}:${actualPort}`,
        server: wrappedServer,
      };
    } catch (err) {
      if (
        isErrnoException(err) &&
        (err.code === "EADDRINUSE" || err.code === "EACCES")
      ) {
        console.log(`Port ${port} is busy, trying ${port + 1}...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`No available port found starting from ${options.port}`);
}
