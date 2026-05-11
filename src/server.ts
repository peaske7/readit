import { type FSWatcher, watch } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { basename, dirname, join } from "node:path";
import { findAnchorWithFallback } from "./lib/anchor.js";
import {
  computeHash,
  createComment,
  getCommentPath,
  getLineHint,
  parseCommentFile,
  serializeComments,
  truncateSelection,
} from "./lib/comment-storage.js";
import { findTextPosition } from "./lib/highlight/resolver.js";
import { extractTextFromHtml } from "./lib/html-text.js";
import { createKeyLock } from "./lib/key-lock.js";
import { getShiki, renderMarkdown } from "./lib/markdown-renderer.js";
import { disposeMermaidWorker } from "./lib/mermaid-renderer.js";
import { isMarkdownFile } from "./lib/utils.js";
import {
  AnchorConfidences,
  type Comment,
  type DocumentSettings,
  FontFamilies,
  type FontFamily,
} from "./schema.js";
import { renderTemplate } from "./template.js";

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

const withCommentLock = createKeyLock("comments");

async function canonicalPath(filePath: string): Promise<string> {
  return fs.realpath(path.resolve(filePath));
}

async function readCommentsFromFile(
  filePath: string,
  sourceContent: string,
  renderedHtml?: string,
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

    const domText = renderedHtml ? extractTextFromHtml(renderedHtml) : null;

    const resolvedComments = file.comments.map((comment) => {
      const textForMatching = comment.anchorPrefix || comment.selectedText;

      const anchor = findAnchorWithFallback({
        source: sourceContent,
        selectedText: textForMatching,
        lineHint: comment.lineHint || "L1",
      });

      if (!anchor) {
        return {
          ...comment,
          anchorConfidence: AnchorConfidences.UNRESOLVED,
        };
      }

      let startOffset = anchor.start;
      let endOffset = anchor.end;

      if (domText) {
        const domPos = findTextPosition(
          domText,
          comment.selectedText,
          anchor.start,
        );
        if (domPos) {
          startOffset = domPos.start;
          endOffset = domPos.end;
        }
      }

      return {
        ...comment,
        startOffset,
        endOffset,
        lineHint: `L${anchor.line}`,
        anchorConfidence: anchor.confidence,
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

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function errorWithDetail(
  message: string,
  err: unknown,
  status = 500,
): Response {
  const detail = err instanceof Error ? err.message : String(err);
  return errorResponse(`${message}: ${detail}`, status);
}

interface RouteContext {
  filePath: string;
  getCurrentContent: () => Promise<string>;
}

async function getComments(
  ctx: RouteContext,
  renderedHtml?: string,
): Promise<Response> {
  try {
    const currentContent = await ctx.getCurrentContent();
    const comments = await readCommentsFromFile(
      ctx.filePath,
      currentContent,
      renderedHtml,
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

    const currentContent = await ctx.getCurrentContent();
    const newComment = createComment(
      selectedText,
      commentText,
      startOffset,
      endOffset,
      currentContent,
    );

    await withCommentLock(ctx.filePath, async () => {
      const existingComments = await readCommentsFromFile(
        ctx.filePath,
        currentContent,
      );
      const allComments = [...existingComments, newComment];
      await writeCommentsToFile(ctx.filePath, currentContent, allComments);
    });

    return json({ comment: newComment }, 201);
  } catch (err) {
    console.error("Failed to add comment:", err);
    return errorWithDetail("Failed to add comment", err);
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
    const result = await withCommentLock(ctx.filePath, async () => {
      const existingComments = await readCommentsFromFile(
        ctx.filePath,
        currentContent,
      );
      const commentIndex = existingComments.findIndex((c) => c.id === id);
      if (commentIndex === -1) return null;
      const updatedComments = existingComments.map((c, i) =>
        i === commentIndex ? { ...c, comment: commentText.trim() } : c,
      );
      await writeCommentsToFile(ctx.filePath, currentContent, updatedComments);
      return updatedComments[commentIndex];
    });

    if (!result) return errorResponse("Comment not found", 404);
    return json({ comment: result });
  } catch (err) {
    console.error("Failed to update comment:", err);
    return errorWithDetail("Failed to update comment", err);
  }
}

async function deleteComment(ctx: RouteContext, id: string): Promise<Response> {
  try {
    const currentContent = await ctx.getCurrentContent();
    const found = await withCommentLock(ctx.filePath, async () => {
      const existingComments = await readCommentsFromFile(
        ctx.filePath,
        currentContent,
      );
      const filteredComments = existingComments.filter((c) => c.id !== id);
      if (filteredComments.length === existingComments.length) return false;
      if (filteredComments.length === 0) {
        await deleteCommentFile(ctx.filePath);
      } else {
        await writeCommentsToFile(
          ctx.filePath,
          currentContent,
          filteredComments,
        );
      }
      return true;
    });

    if (!found) return errorResponse("Comment not found", 404);
    return json({ success: true });
  } catch (err) {
    console.error("Failed to delete comment:", err);
    return errorWithDetail("Failed to delete comment", err);
  }
}

async function clearComments(ctx: RouteContext): Promise<Response> {
  try {
    await withCommentLock(ctx.filePath, () => deleteCommentFile(ctx.filePath));
    return json({ success: true });
  } catch (err) {
    console.error("Failed to clear comments:", err);
    return errorWithDetail("Failed to clear comments", err);
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
    const result = await withCommentLock(ctx.filePath, async () => {
      const existingComments = await readCommentsFromFile(
        ctx.filePath,
        currentContent,
      );
      const commentIndex = existingComments.findIndex((c) => c.id === id);
      if (commentIndex === -1) return null;

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
      return updatedComment;
    });

    if (!result) return errorResponse("Comment not found", 404);
    return json({ comment: result });
  } catch (err) {
    console.error("Failed to re-anchor comment:", err);
    return errorWithDetail("Failed to re-anchor comment", err);
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

async function serveStaticFile(
  distPath: string,
  pathname: string,
): Promise<Response> {
  const filePath = join(distPath, pathname);
  const file = Bun.file(filePath);

  if (await file.exists()) {
    const isHashed = pathname.startsWith("/assets/");
    const headers: Record<string, string> = isHashed
      ? { "Cache-Control": "public, max-age=31536000, immutable" }
      : {};
    return new Response(file, { headers });
  }

  const indexFile = Bun.file(join(distPath, "index.html"));
  if (await indexFile.exists()) {
    return new Response(indexFile);
  }

  return new Response("Not Found", { status: 404 });
}

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
    return res.ok;
  } catch {
    return false;
  }
}

async function spawnViteDev(): Promise<() => void> {
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

function extractCommentId(pathname: string): string | undefined {
  const match = pathname.match(/^\/api\/comments\/([^/]+)/);
  return match?.[1];
}

interface FileState {
  content: string | null;
  renderedHtml: string | null;
  headings: import("./lib/headings").Heading[] | null;
  isLoaded: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

interface ServerWithWatchers {
  server: ReturnType<typeof Bun.serve>;
  watchers: FSWatcher[];
}

function createServer(options: ServerOptions): ServerWithWatchers {
  const fileMap = new Map<string, FileState>();
  const fileOrder: string[] = [];

  for (const entry of options.files) {
    fileMap.set(entry.filePath, {
      content: entry.content ?? null,
      renderedHtml: null,
      headings: null,
      isLoaded: entry.content !== undefined,
      debounceTimer: null,
    });
    fileOrder.push(entry.filePath);

    if (options.clean) {
      const commentPath = getCommentPath(entry.filePath);
      fs.unlink(commentPath).catch(() => {});
      invalidateResolvedComments(entry.filePath);
    }
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

  async function ensureRenderedHtml(
    filePath: string,
  ): Promise<{ html: string; headings: import("./lib/headings").Heading[] }> {
    const state = fileMap.get(filePath);
    if (!state) throw new Error(`File not found: ${filePath}`);

    if (state.renderedHtml !== null && state.headings !== null) {
      return { html: state.renderedHtml, headings: state.headings };
    }

    const content = await ensureFileContent(filePath);
    const result = await renderMarkdown(content);
    state.renderedHtml = result.html;
    state.headings = result.headings;
    return result;
  }

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

  let manifestCache: Record<string, { file: string; css?: string[] }> | null =
    null;

  async function getManifest(): Promise<typeof manifestCache> {
    if (manifestCache) return manifestCache;
    try {
      const manifestPath = join(distPath, ".vite", "manifest.json");
      const content = await fs.readFile(manifestPath, "utf-8");
      manifestCache = JSON.parse(content);
      return manifestCache;
    } catch {
      return null;
    }
  }

  let pageCache: string | null = null;
  let pageCacheGz: Uint8Array<ArrayBuffer> | null = null;

  function invalidatePageCache(): void {
    pageCache = null;
    pageCacheGz = null;
  }

  async function serveAppPage(req: Request): Promise<Response> {
    const acceptGzip =
      req.headers.get("accept-encoding")?.includes("gzip") ?? false;

    try {
      if (pageCache) {
        if (acceptGzip && pageCacheGz) {
          return new Response(pageCacheGz, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Encoding": "gzip",
            },
          });
        }
        return new Response(pageCache, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      const { html, headings } = await ensureRenderedHtml(defaultPath);
      const content = await ensureFileContent(defaultPath);
      const comments = await readCommentsFromFile(defaultPath, content, html);
      const settings = await readSettings();

      const files = fileOrder.map((fp) => ({
        path: fp,
        fileName: basename(fp),
      }));

      const inlineData = {
        files,
        activeFile: defaultPath,
        settings,
        documents: {
          [defaultPath]: {
            headings,
            comments,
          },
        },
        clean: options.clean || false,
        workingDirectory: process.cwd(),
      };

      let cssPath = "";
      let jsPath: string;

      if (isDev) {
        jsPath = `http://127.0.0.1:${VITE_DEV_PORT}/src/main.ts`;
      } else {
        const manifest = await getManifest();
        const entry = manifest?.["index.html"];
        jsPath = entry ? `/${entry.file}` : "/assets/index.js";
        if (entry?.css?.[0]) {
          cssPath = `/${entry.css[0]}`;
        }
      }

      const body = renderTemplate({
        title: basename(defaultPath),
        cssPath,
        jsPath,
        documentHtml: html,
        inlineData,
        isDev,
        fontFamily: settings.fontFamily,
      });

      if (!isDev) {
        pageCache = body;
        pageCacheGz = Bun.gzipSync(
          new TextEncoder().encode(body),
        ) as Uint8Array<ArrayBuffer>;
      }

      if (acceptGzip) {
        const gz = pageCacheGz ?? Bun.gzipSync(new TextEncoder().encode(body));
        return new Response(gz, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Encoding": "gzip",
          },
        });
      }

      return new Response(body, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      console.error("Failed to serve app page:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  function watchFile(targetPath: string): FSWatcher | null {
    try {
      const watcher = watch(targetPath, async (eventType) => {
        // Handle both "change" and "rename" events.
        // Many editors (Vim, Neovim, Emacs) save files by writing to a temp
        // file and then renaming it over the original. This triggers a
        // "rename" event rather than "change". After a rename the original
        // watcher may become invalid, so we re-establish it.
        if (eventType !== "change" && eventType !== "rename") return;

        const state = fileMap.get(targetPath);
        if (!state) return;

        if (state.debounceTimer) clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(async () => {
          try {
            const newContent = await fs.readFile(targetPath, "utf-8");
            if (!state.isLoaded || newContent !== state.content) {
              state.content = newContent;
              state.renderedHtml = null;
              state.headings = null;
              state.isLoaded = true;
              invalidateResolvedComments(targetPath);
              invalidatePageCache();
              console.log(`File changed: ${basename(targetPath)}`);
              sendEvent({ type: "document-updated", path: targetPath });
            }
          } catch (err) {
            // File may have been temporarily removed during a rename-save.
            // If it reappears, re-establish the watcher.
            if (isErrnoException(err) && err.code === "ENOENT") {
              await rewatch(targetPath);
            } else {
              console.error(`Failed to read updated file ${targetPath}:`, err);
            }
          }
        }, 100);
      });

      // Re-establish file watch after a rename-style save
      async function rewatch(filePath: string) {
        const maxRetries = 10;
        const retryInterval = 200;
        for (let i = 0; i < maxRetries; i++) {
          await new Promise((r) => setTimeout(r, retryInterval));
          try {
            await fs.access(filePath);
            // File exists again — close old watcher, create new one
            try {
              watcher.close();
            } catch {}
            const idx = watchers.indexOf(watcher);
            const newWatcher = watchFile(filePath);
            if (newWatcher) {
              if (idx >= 0) watchers[idx] = newWatcher;
              else watchers.push(newWatcher);
            }
            // Read the new content and emit update
            const state = fileMap.get(filePath);
            if (state) {
              const newContent = await fs.readFile(filePath, "utf-8");
              if (!state.isLoaded || newContent !== state.content) {
                state.content = newContent;
                state.renderedHtml = null;
                state.headings = null;
                state.isLoaded = true;
                invalidateResolvedComments(filePath);
                invalidatePageCache();
                console.log(`File changed: ${basename(filePath)}`);
                sendEvent({ type: "document-updated", path: filePath });
              }
            }
            return;
          } catch {
            // File not yet recreated, keep retrying
          }
        }
        console.warn(`File did not reappear after rename: ${filePath}`);
      }

      return watcher;
    } catch (err) {
      console.warn(`File watching not available for ${targetPath}:`, err);
      return null;
    }
  }

  const watchers: FSWatcher[] = [];

  const server = Bun.serve({
    port: options.port,
    hostname: options.host,
    idleTimeout: 255,

    async fetch(req: Request) {
      const url = new URL(req.url);
      const { pathname } = url;
      const method = req.method;

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
            fileMap.set(filePath, {
              content: null,
              renderedHtml: null,
              headings: null,
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

      if (pathname === "/api/document" && method === "GET") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        const { html, headings } = await ensureRenderedHtml(ctxOrRes.filePath);
        return json({
          html,
          headings,
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

      if (pathname === "/api/comments" && method === "GET") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        const rendered = await ensureRenderedHtml(ctxOrRes.filePath);
        return getComments(ctxOrRes, rendered.html);
      }

      if (pathname === "/api/comments/raw" && method === "GET") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        return getRawComments(ctxOrRes);
      }

      if (pathname === "/api/comments" && method === "POST") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        invalidatePageCache();
        return addComment(ctxOrRes, req);
      }

      if (pathname === "/api/comments" && method === "DELETE") {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        invalidatePageCache();
        return clearComments(ctxOrRes);
      }

      const commentId = extractCommentId(pathname);
      if (commentId) {
        const ctxOrRes = requireContext(url);
        if (ctxOrRes instanceof Response) return ctxOrRes;
        invalidatePageCache();

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

      if (pathname === "/api/settings" && method === "GET") {
        return getSettingsRoute();
      }

      if (pathname === "/api/settings" && method === "PUT") {
        return updateSettingsRoute(req);
      }

      if (pathname === "/") {
        return serveAppPage(req);
      }

      if (isDev) {
        return proxyToVite(req, pathname, url.search);
      }
      return serveStaticFile(distPath, pathname);
    },
  });

  for (const fp of fileOrder) {
    const watcher = watchFile(fp);
    if (watcher) watchers.push(watcher);
  }

  return { server, watchers };
}

export async function startServer(
  options: ServerOptions,
): Promise<ServerResult> {
  getShiki();

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
          disposeMermaidWorker();
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
