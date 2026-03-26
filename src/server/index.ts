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
import { isMarkdownFile } from "../lib/utils.js";
import {
  AnchorConfidences,
  type Comment,
  type DocumentSettings,
  FontFamilies,
  type FontFamily,
} from "../types/index.js";

// ─── Helpers ─────────────────────────────────────────────────────────

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

export interface FileEntry {
  content?: string;
  filePath: string;
}

export interface ServerOptions {
  files: FileEntry[];
  port: number;
  host: string;
  clean?: boolean;
}

export interface ServerResult {
  port: number;
  url: string;
  server: { stop(): void };
}

interface ResolvedCommentsCacheEntry {
  commentMtimeMs: number;
  sourceHash: string;
  comments: Comment[];
}

const resolvedCommentsCache = new Map<string, ResolvedCommentsCacheEntry>();

function invalidateResolvedComments(filePath: string): void {
  resolvedCommentsCache.delete(filePath);
}

async function canonicalPath(filePath: string): Promise<string> {
  return fs.realpath(path.resolve(filePath));
}

async function readCommentsFromFile(
  filePath: string,
  sourceContent: string,
): Promise<Comment[]> {
  const commentPath = getCommentPath(filePath);
  const sourceHash = computeHash(sourceContent);

  try {
    const stats = await fs.stat(commentPath);
    const cached = resolvedCommentsCache.get(filePath);
    if (
      cached &&
      cached.sourceHash === sourceHash &&
      cached.commentMtimeMs === stats.mtimeMs
    ) {
      return cached.comments;
    }

    const content = await fs.readFile(commentPath, "utf-8");
    const file = parseCommentFile(content);
    const resolvedComments = file.comments.map((comment) => {
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

    resolvedCommentsCache.set(filePath, {
      sourceHash,
      commentMtimeMs: stats.mtimeMs,
      comments: resolvedComments,
    });

    return resolvedComments;
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      invalidateResolvedComments(filePath);
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
  invalidateResolvedComments(filePath);
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
  invalidateResolvedComments(filePath);
}

const SETTINGS_PATH = path.join(os.homedir(), ".readit", "settings.json");

const DEFAULT_SETTINGS: DocumentSettings = {
  version: 1,
  fontFamily: FontFamilies.SERIF,
};

async function readSettings(): Promise<DocumentSettings> {
  try {
    const content = await fs.readFile(SETTINGS_PATH, "utf-8");
    return JSON.parse(content) as DocumentSettings;
  } catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") {
      return DEFAULT_SETTINGS;
    }
    throw err;
  }
}

async function writeSettings(settings: DocumentSettings): Promise<void> {
  const settingsDir = dirname(SETTINGS_PATH);
  await fs.mkdir(settingsDir, { recursive: true });

  const tempPath = `${SETTINGS_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), "utf-8");
  await fs.rename(tempPath, SETTINGS_PATH);
}

function isValidFontFamily(value: unknown): value is FontFamily {
  return value === FontFamilies.SERIF || value === FontFamilies.SANS_SERIF;
}

// ─── PID file helpers ───────────────────────────────────────────────

export const SERVER_INFO_PATH = path.join(
  os.homedir(),
  ".readit",
  "server.json",
);

async function writeServerInfo(port: number): Promise<void> {
  await fs.mkdir(path.dirname(SERVER_INFO_PATH), { recursive: true });
  await fs.writeFile(
    SERVER_INFO_PATH,
    JSON.stringify({ port, pid: process.pid }),
    "utf-8",
  );
}

export async function removeServerInfo(): Promise<void> {
  try {
    await fs.unlink(SERVER_INFO_PATH);
  } catch (err) {
    if (!isErrnoException(err) || err.code !== "ENOENT") {
      console.error("Failed to remove server info:", err);
    }
  }
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
  getCurrentContent: () => Promise<string>;
}

// ─── Route handlers ─────────────────────────────────────────────────

async function getComments(ctx: RouteContext): Promise<Response> {
  try {
    const currentContent = await ctx.getCurrentContent();
    const comments = await readCommentsFromFile(ctx.filePath, currentContent);
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

    const currentContent = await ctx.getCurrentContent();
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

    const currentContent = await ctx.getCurrentContent();
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
    const currentContent = await ctx.getCurrentContent();
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

    const currentContent = await ctx.getCurrentContent();
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

async function getSettingsRoute(): Promise<Response> {
  try {
    const settings = await readSettings();
    return json(settings);
  } catch (err) {
    console.error("Failed to read settings:", err);
    return errorResponse("Failed to read settings", 500);
  }
}

async function updateSettingsRoute(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { fontFamily } = body;

    if (fontFamily !== undefined && !isValidFontFamily(fontFamily)) {
      return errorResponse("Invalid font family", 400);
    }

    const current = await readSettings();
    const settings: DocumentSettings = {
      ...current,
      ...(fontFamily !== undefined && { fontFamily }),
    };

    await writeSettings(settings);
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
  let pingInterval: ReturnType<typeof setInterval>;
  let captured: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(controller) {
      captured = controller;
      controller.enqueue("data: connected\n\n");
      sseClients.add(controller);
      pingInterval = setInterval(() => {
        try {
          controller.enqueue("data: ping\n\n");
        } catch {
          clearInterval(pingInterval);
          sseClients.delete(controller);
        }
      }, 5000);
    },
    cancel() {
      clearInterval(pingInterval);
      sseClients.delete(captured);
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

function createHeartbeat(
  onOpen: (controller: ReadableStreamDefaultController) => void,
  onClose: (controller: ReadableStreamDefaultController) => void,
): Response {
  let interval: ReturnType<typeof setInterval>;
  let captured: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(controller) {
      captured = controller;
      controller.enqueue("data: connected\n\n");
      onOpen(controller);
      interval = setInterval(() => {
        try {
          controller.enqueue("data: ping\n\n");
        } catch {
          clearInterval(interval);
          onClose(controller);
        }
      }, 5000);
    },
    cancel() {
      clearInterval(interval);
      onClose(captured);
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

// ─── Dev proxy ──────────────────────────────────────────────────────

const VITE_DEV_PORT = 24678;
const VITE_DEV_ORIGIN = `http://127.0.0.1:${VITE_DEV_PORT}`;

async function proxyToVite(
  req: Request,
  pathname: string,
  search: string,
): Promise<Response> {
  const target = `${VITE_DEV_ORIGIN}${pathname}${search}`;
  try {
    return await fetch(
      new Request(target, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        redirect: "manual",
      }),
    );
  } catch {
    return new Response("Vite dev server not available", { status: 502 });
  }
}

async function isViteReady(): Promise<boolean> {
  try {
    const res = await fetch(`${VITE_DEV_ORIGIN}/`);
    // Vite returns 200 with index.html content when properly serving
    return res.ok;
  } catch {
    return false;
  }
}

async function spawnViteDev(): Promise<() => void> {
  // If Vite is already running (e.g. after bun --watch restart), reuse it
  if (await isViteReady()) {
    return () => {};
  }

  const child = Bun.spawn(
    ["bunx", "vite", "--port", String(VITE_DEV_PORT), "--strictPort"],
    { stdout: "ignore", stderr: "inherit" },
  );

  const maxWaitMs = 10_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isViteReady()) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  return () => {
    child.kill();
  };
}

// ─── Extract route param ────────────────────────────────────────────

function extractCommentId(pathname: string): string | undefined {
  const match = pathname.match(/^\/api\/comments\/([^/]+)/);
  return match?.[1];
}

// ─── Multi-file state ───────────────────────────────────────────────

interface FileState {
  content: string | null;
  isLoaded: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Server creation ────────────────────────────────────────────────

interface ServerWithWatchers {
  server: ReturnType<typeof Bun.serve>;
  watchers: FSWatcher[];
}

function createServer(options: ServerOptions): ServerWithWatchers {
  // Map of absolute path → mutable file state
  const fileMap = new Map<string, FileState>();
  // Ordered list of file paths (insertion order for tab display)
  const fileOrder: string[] = [];

  for (const entry of options.files) {
    fileMap.set(entry.filePath, {
      content: entry.content ?? null,
      isLoaded: entry.content !== undefined,
      debounceTimer: null,
    });
    fileOrder.push(entry.filePath);
  }

  const defaultPath = fileOrder[0];
  const sseClients = new Set<ReadableStreamDefaultController>();
  const heartbeatClients = new Set<ReadableStreamDefaultController>();
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

  function sendEvent(event: unknown): void {
    const message = `data: ${JSON.stringify(event)}\n\n`;
    for (const controller of sseClients) {
      try {
        controller.enqueue(message);
      } catch {
        sseClients.delete(controller);
      }
    }
  }

  function clearShutdownTimer(): void {
    if (!shutdownTimer) return;
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }

  function onHeartbeatOpen(controller: ReadableStreamDefaultController): void {
    heartbeatClients.add(controller);
    clearShutdownTimer();
  }

  function onHeartbeatClose(controller: ReadableStreamDefaultController): void {
    heartbeatClients.delete(controller);
    if (isDev || heartbeatClients.size > 0 || shutdownTimer) return;

    shutdownTimer = setTimeout(() => {
      if (heartbeatClients.size > 0) {
        clearShutdownTimer();
        return;
      }
      console.log("\nBrowser disconnected, shutting down...");
      process.exit(0);
    }, 1500);
  }

  async function ensureFileContent(filePath: string): Promise<string> {
    const state = fileMap.get(filePath);
    if (!state) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (state.isLoaded && state.content !== null) {
      return state.content;
    }

    const content = await fs.readFile(filePath, "utf-8");
    state.content = content;
    state.isLoaded = true;
    return content;
  }

  // Resolve the target file from ?path= query param, falling back to first file
  function resolveContext(url: URL): RouteContext | null {
    const requestedPath = url.searchParams.get("path") ?? defaultPath;
    const state = fileMap.get(requestedPath);
    if (!state) return null;
    return {
      filePath: requestedPath,
      getCurrentContent: () => ensureFileContent(requestedPath),
    };
  }

  function requireContext(url: URL): RouteContext | Response {
    const ctx = resolveContext(url);
    if (!ctx) {
      return errorResponse("File not found", 404);
    }
    return ctx;
  }

  const isDev = process.env.NODE_ENV === "development";
  const distPath = import.meta.dir;

  function watchFile(targetPath: string): FSWatcher | null {
    try {
      const watcher = watch(targetPath, async (eventType) => {
        if (eventType !== "change") return;

        const state = fileMap.get(targetPath);
        if (!state) return;

        if (state.debounceTimer) clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(async () => {
          try {
            const newContent = await fs.readFile(targetPath, "utf-8");
            if (!state.isLoaded || newContent !== state.content) {
              state.content = newContent;
              state.isLoaded = true;
              invalidateResolvedComments(targetPath);
              console.log(`File changed: ${basename(targetPath)}`);
              sendEvent({ type: "document-updated", path: targetPath });
            }
          } catch (err) {
            console.error(`Failed to read updated file ${targetPath}:`, err);
          }
        }, 100);
      });
      return watcher;
    } catch (err) {
      console.warn(`File watching not available for ${targetPath}:`, err);
      return null;
    }
  }

  const server = Bun.serve({
    port: options.port,
    hostname: options.host,
    idleTimeout: 255, // max value (seconds) — SSE streams stay open long

    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      const method = req.method;

      // ── API routes ──────────────────────────────────────────

      // Document list (multi-file)
      if (pathname === "/api/documents" && method === "GET") {
        const files = fileOrder.map((fp) => ({
          path: fp,
          fileName: basename(fp),
        }));
        return json({
          files,
          clean: options.clean || false,
          workingDirectory: process.cwd(),
        });
      }

      // Register a document for this session without forcing focus
      if (pathname === "/api/documents" && method === "POST") {
        try {
          const { path: requestedPath } = await req.json();

          if (!requestedPath || typeof requestedPath !== "string") {
            return errorResponse("Missing 'path' field", 400);
          }

          let filePath: string;
          try {
            filePath = await canonicalPath(requestedPath);
          } catch (err) {
            if (isErrnoException(err) && err.code === "ENOENT") {
              return errorResponse(`File not found: ${requestedPath}`, 404);
            }
            throw err;
          }
          if (!isMarkdownFile(filePath)) {
            return errorResponse(
              `Unsupported file type: ${filePath} (expected .md or .markdown)`,
              400,
            );
          }

          const existingState = fileMap.get(filePath);

          if (existingState) {
            return json({
              path: filePath,
              fileName: basename(filePath),
              status: "present",
            });
          } else {
            // New document — register metadata only, load content on demand
            fileMap.set(filePath, {
              content: null,
              isLoaded: false,
              debounceTimer: null,
            });
            fileOrder.push(filePath);

            const watcher = watchFile(filePath);
            if (watcher) watchers.push(watcher);

            sendEvent({
              type: "document-added",
              path: filePath,
              fileName: basename(filePath),
            });
          }

          return json({
            path: filePath,
            fileName: basename(filePath),
            status: "added",
          });
        } catch (err) {
          console.error("Failed to add document:", err);
          return errorResponse("Failed to add document", 500);
        }
      }

      // Single document (backward compat + path-aware)
      if (pathname === "/api/document" && method === "GET") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        const content = await ctxOrRes.getCurrentContent();
        return json({
          content,
          filePath: ctxOrRes.filePath,
          fileName: basename(ctxOrRes.filePath),
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
        return createHeartbeat(onHeartbeatOpen, onHeartbeatClose);
      }

      // Comments routes
      if (pathname === "/api/comments" && method === "GET") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        return getComments(ctxOrRes);
      }

      if (pathname === "/api/comments/raw" && method === "GET") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        return getRawComments(ctxOrRes);
      }

      if (pathname === "/api/comments" && method === "POST") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        return addComment(ctxOrRes, req);
      }

      if (pathname === "/api/comments" && method === "DELETE") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        return clearComments(ctxOrRes);
      }

      // Parameterized comment routes
      const commentId = extractCommentId(pathname);
      if (commentId) {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;

        if (pathname.endsWith("/reanchor") && method === "PUT") {
          return reanchorComment(ctxOrRes, req, commentId);
        }
        if (method === "PUT") {
          return updateComment(ctxOrRes, req, commentId);
        }
        if (method === "DELETE") {
          return deleteComment(ctxOrRes, commentId);
        }
      }

      // Settings routes (global, not per-document)
      if (pathname === "/api/settings" && method === "GET") {
        return getSettingsRoute();
      }

      if (pathname === "/api/settings" && method === "PUT") {
        return updateSettingsRoute(req);
      }

      // ── Static / SPA serving ────────────────────────────────

      if (isDev) {
        return proxyToVite(req, pathname, url.search);
      }
      return serveStaticFile(distPath, pathname);
    },
  });

  // Set up per-file watchers after Bun.serve() succeeds to avoid
  // leaking FSWatcher handles if the server fails to bind.
  const watchers: FSWatcher[] = [];
  for (const fp of fileOrder) {
    const watcher = watchFile(fp);
    if (watcher) watchers.push(watcher);
  }

  return { server, watchers };
}

// ─── Port fallback + start ──────────────────────────────────────────

export async function startServer(
  options: ServerOptions,
): Promise<ServerResult> {
  const MAX_PORT = 65535;

  for (let port = options.port; port <= MAX_PORT; port++) {
    try {
      const { server, watchers } = createServer({ ...options, port });

      const displayHost =
        options.host === "0.0.0.0" ? "localhost" : options.host;

      let stopVite: (() => void) | undefined;
      if (process.env.NODE_ENV === "development") {
        stopVite = await spawnViteDev();
      }

      const originalStop = server.stop.bind(server);
      const wrappedServer = {
        stop() {
          stopVite?.();
          for (const w of watchers) w.close();
          originalStop();
        },
      };

      const actualPort = server.port ?? port;

      await writeServerInfo(actualPort);

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
