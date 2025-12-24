import { type FSWatcher, watch } from "node:fs";
import * as fs from "node:fs/promises";
import type { Server } from "node:http";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import express, { type Express } from "express";
import { findAnchorWithFallback } from "../lib/anchor.js";
import {
  computeHash,
  createComment,
  getCommentPath,
  parseCommentFile,
  serializeComments,
} from "../lib/comment-storage.js";
import {
  AnchorConfidences,
  type Comment,
  type DocumentType,
} from "../types/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  server: Server;
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

    // Resolve anchors for each comment
    return file.comments.map((comment) => {
      // Use anchorPrefix for matching when text was truncated, fall back to selectedText
      const textForMatching = comment.anchorPrefix || comment.selectedText;
      const anchor = findAnchorWithFallback(
        sourceContent,
        textForMatching,
        comment.lineHint || "L1",
      );

      if (anchor) {
        return {
          ...comment,
          startOffset: anchor.start,
          endOffset: anchor.end,
          lineHint: `L${anchor.line}`,
          anchorConfidence: anchor.confidence,
        };
      }

      // Anchor not found - return with original offsets (may be stale)
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

/**
 * Write comments to file.
 */
async function writeCommentsToFile(
  filePath: string,
  sourceContent: string,
  comments: Comment[],
): Promise<void> {
  const commentPath = getCommentPath(filePath);
  const commentDir = dirname(commentPath);

  // Ensure directory exists
  await fs.mkdir(commentDir, { recursive: true });

  const file = {
    source: filePath,
    hash: computeHash(sourceContent),
    version: 1,
    comments,
  };

  const content = serializeComments(file);

  // Atomic write: temp file + rename
  const tempPath = `${commentPath}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, commentPath);
}

/**
 * Delete comment file.
 */
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

interface AppWithWatcher {
  app: Express;
  watcher: FSWatcher | null;
}

/**
 * Context passed to route handlers for accessing shared state.
 */
interface HandlerContext {
  filePath: string;
  getCurrentContent: () => string;
}

/**
 * GET /api/comments - Fetch all comments for the current document
 */
async function handleGetComments(
  ctx: HandlerContext,
  res: Response,
): Promise<void> {
  try {
    const comments = await readCommentsFromFile(
      ctx.filePath,
      ctx.getCurrentContent(),
    );
    res.json({ comments });
  } catch (err) {
    console.error("Failed to read comments:", err);
    res.status(500).json({ error: "Failed to read comments" });
  }
}

/**
 * POST /api/comments - Add a new comment
 */
async function handleAddComment(
  ctx: HandlerContext,
  req: express.Request,
  res: Response,
): Promise<void> {
  try {
    const {
      selectedText,
      comment: commentText,
      startOffset,
      endOffset,
    } = req.body;

    if (
      !selectedText ||
      !commentText ||
      startOffset === undefined ||
      endOffset === undefined
    ) {
      res.status(400).json({ error: "Missing required fields" });
      return;
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

    res.status(201).json({ comment: newComment });
  } catch (err) {
    console.error("Failed to add comment:", err);
    res.status(500).json({ error: "Failed to add comment" });
  }
}

/**
 * PUT /api/comments/:id - Update a comment
 */
async function handleUpdateComment(
  ctx: HandlerContext,
  req: express.Request,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;
    const { comment: commentText } = req.body;

    if (!commentText) {
      res.status(400).json({ error: "Missing comment text" });
      return;
    }

    const currentContent = ctx.getCurrentContent();
    const existingComments = await readCommentsFromFile(
      ctx.filePath,
      currentContent,
    );
    const commentIndex = existingComments.findIndex((c) => c.id === id);

    if (commentIndex === -1) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    const updatedComments = existingComments.map((c, i) =>
      i === commentIndex ? { ...c, comment: commentText.trim() } : c,
    );

    await writeCommentsToFile(ctx.filePath, currentContent, updatedComments);

    res.json({ comment: updatedComments[commentIndex] });
  } catch (err) {
    console.error("Failed to update comment:", err);
    res.status(500).json({ error: "Failed to update comment" });
  }
}

/**
 * DELETE /api/comments/:id - Delete a single comment
 */
async function handleDeleteComment(
  ctx: HandlerContext,
  req: express.Request,
  res: Response,
): Promise<void> {
  try {
    const { id } = req.params;

    const currentContent = ctx.getCurrentContent();
    const existingComments = await readCommentsFromFile(
      ctx.filePath,
      currentContent,
    );
    const filteredComments = existingComments.filter((c) => c.id !== id);

    if (filteredComments.length === existingComments.length) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }

    if (filteredComments.length === 0) {
      await deleteCommentFile(ctx.filePath);
    } else {
      await writeCommentsToFile(ctx.filePath, currentContent, filteredComments);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to delete comment:", err);
    res.status(500).json({ error: "Failed to delete comment" });
  }
}

/**
 * DELETE /api/comments - Clear all comments
 */
async function handleClearComments(
  ctx: HandlerContext,
  res: Response,
): Promise<void> {
  try {
    await deleteCommentFile(ctx.filePath);
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to clear comments:", err);
    res.status(500).json({ error: "Failed to clear comments" });
  }
}

function createApp(options: ServerOptions): AppWithWatcher {
  const app = express();

  // Mutable content store - updated when file changes
  let currentContent = options.content;

  // SSE clients for document update broadcasts
  const documentStreamClients: Set<Response> = new Set();

  // Debounce timer for file changes
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // File watcher
  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(options.filePath, async (eventType) => {
      if (eventType !== "change") return;

      // Debounce rapid changes (editors often trigger multiple events)
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const newContent = await fs.readFile(options.filePath, "utf-8");
          if (newContent !== currentContent) {
            currentContent = newContent;
            console.log("File changed, notifying clients...");
            // Broadcast to all connected clients
            for (const client of documentStreamClients) {
              client.write("data: update\n\n");
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

  app.use(express.json());

  // Serve static files from dist (production) or redirect to vite (dev)
  const isDev = process.env.NODE_ENV === "development";

  if (isDev) {
    // In dev, proxy to Vite dev server
    app.get("/", (_req, res) => {
      res.redirect("http://localhost:5173");
    });
  } else {
    // In production, serve built files from dist (same directory as CLI)
    const distPath = __dirname;
    app.use(express.static(distPath));

    // Serve index.html for SPA routing (Express 5 syntax)
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api")) {
        return next();
      }
      res.sendFile(join(distPath, "index.html"));
    });
  }

  // API: Get document content (always returns current content)
  app.get("/api/document", (_req, res) => {
    res.json({
      content: currentContent,
      type: options.type,
      filePath: options.filePath,
      fileName: basename(options.filePath),
      clean: options.clean || false,
    });
  });

  // API: SSE stream for document updates
  app.get("/api/document/stream", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connection
    res.write("data: connected\n\n");

    // Add to clients set
    documentStreamClients.add(res);

    // Remove on disconnect
    req.on("close", () => {
      documentStreamClients.delete(res);
    });
  });

  // API: Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Handler context for comment routes
  const ctx: HandlerContext = {
    filePath: options.filePath,
    getCurrentContent: () => currentContent,
  };

  // Comment API routes
  app.get("/api/comments", (_req, res) => handleGetComments(ctx, res));
  app.post("/api/comments", (req, res) => handleAddComment(ctx, req, res));
  app.put("/api/comments/:id", (req, res) =>
    handleUpdateComment(ctx, req, res),
  );
  app.delete("/api/comments/:id", (req, res) =>
    handleDeleteComment(ctx, req, res),
  );
  app.delete("/api/comments", (_req, res) => handleClearComments(ctx, res));

  // API: Heartbeat SSE - detects when browser tab closes
  app.get("/api/heartbeat", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial connection
    res.write("data: connected\n\n");

    // Send heartbeat every 5 seconds
    const interval = setInterval(() => {
      res.write("data: ping\n\n");
    }, 5000);

    // When client disconnects (tab closed, navigation, etc.)
    req.on("close", () => {
      clearInterval(interval);
      // Small delay to handle any pending requests
      setTimeout(() => {
        console.log("\nBrowser disconnected, shutting down...");
        process.exit(0);
      }, 100);
    });
  });

  return { app, watcher };
}

function tryListenOnPort(
  app: Express,
  port: number,
  host: string,
): Promise<ServerResult> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    server.on("listening", () => {
      const displayHost = host === "0.0.0.0" ? "localhost" : host;
      resolve({ port, url: `http://${displayHost}:${port}`, server });
    });
    server.on("error", reject);
  });
}

async function startServerWithFallback(
  app: Express,
  preferredPort: number,
  host: string,
): Promise<ServerResult> {
  const MAX_PORT = 65535;
  let port = preferredPort;

  while (true) {
    try {
      return await tryListenOnPort(app, port, host);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        port++;
        if (port > MAX_PORT) {
          throw new Error(
            `No available port found starting from ${preferredPort}`,
          );
        }
        console.log(`Port ${port - 1} is busy, trying ${port}...`);
      } else {
        throw err;
      }
    }
  }
}

export async function startServer(
  options: ServerOptions,
): Promise<ServerResult> {
  const { app, watcher } = createApp(options);
  const result = await startServerWithFallback(app, options.port, options.host);

  // Clean up watcher on server close
  result.server.on("close", () => {
    watcher?.close();
  });

  return result;
}
