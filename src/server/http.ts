import * as fs from "node:fs/promises";
import { basename, join } from "node:path";
import { canonicalizePath, readSettings } from "../lib/readit-home.js";
import { isMarkdownFile } from "../lib/utils.js";
import { loadRemote, loadShares } from "../remote.js";
import { isShareMode, ShareModes } from "../schema.js";
import { shareFile, unshareFile } from "../share.js";
import { renderTemplate } from "../template.js";
import { type DocumentSession, TaskPatchResults } from "./session.js";
import {
  isValidFontFamily,
  isValidKeybindings,
  updateSettings,
} from "./settings.js";
import { proxyToVite, VITE_CLIENT_ENTRY } from "./vite-dev.js";

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
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

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

const PING_INTERVAL_MS = 5000;
const SHUTDOWN_DELAY_MS = 1500;

/** An SSE response that pings every 5s and cleans up when it goes away. */
function eventStream(
  onOpen: (send: (data: string) => void) => () => void,
): Response {
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(data);
        } catch {
          cleanup();
        }
      };

      controller.enqueue("data: connected\n\n");
      const onClose = onOpen(send);
      const ping = setInterval(() => send("data: ping\n\n"), PING_INTERVAL_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        onClose();
      };
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
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

function extractCommentId(pathname: string): string | undefined {
  const match = pathname.match(/^\/api\/comments\/([^/]+)/);
  return match?.[1];
}

export interface FetchHandlerOptions {
  session: DocumentSession;
  /** Directory holding the built frontend and its Vite manifest. */
  assetsDir: string;
  isDev: boolean;
  clean?: boolean;
  /** Called once the last browser has been gone for a moment. */
  onIdleShutdown?: () => void;
}

/** A route that operates on one open document. */
type FileRoute = (filePath: string) => Promise<Response> | Response;

/**
 * Translates HTTP into `DocumentSession` calls: parses the request, resolves
 * the document once, serializes the result. All the state it owns is
 * transport state — SSE clients and the Vite manifest.
 */
export function createFetchHandler(
  options: FetchHandlerOptions,
): (req: Request) => Promise<Response> {
  const { session, assetsDir, isDev, onIdleShutdown } = options;
  const clean = options.clean ?? false;

  const heartbeatClients = new Set<object>();
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  let manifestCache: Record<string, { file: string; css?: string[] }> | null =
    null;

  function documentStream(): Response {
    return eventStream((send) =>
      session.subscribe((event) => send(`data: ${JSON.stringify(event)}\n\n`)),
    );
  }

  function heartbeat(): Response {
    return eventStream(() => {
      const client = {};
      heartbeatClients.add(client);
      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
        shutdownTimer = null;
      }

      return () => {
        heartbeatClients.delete(client);
        if (!onIdleShutdown || heartbeatClients.size > 0 || shutdownTimer) {
          return;
        }
        shutdownTimer = setTimeout(() => {
          if (heartbeatClients.size > 0) {
            clearTimeout(shutdownTimer as ReturnType<typeof setTimeout>);
            shutdownTimer = null;
            return;
          }
          onIdleShutdown();
        }, SHUTDOWN_DELAY_MS);
      };
    });
  }

  async function getManifest(): Promise<typeof manifestCache> {
    if (manifestCache) return manifestCache;
    try {
      const content = await fs.readFile(
        join(assetsDir, ".vite", "manifest.json"),
        "utf-8",
      );
      manifestCache = JSON.parse(content);
      return manifestCache;
    } catch {
      return null;
    }
  }

  async function serveAppPage(req: Request, url: URL): Promise<Response> {
    const acceptGzip =
      req.headers.get("accept-encoding")?.includes("gzip") ?? false;
    const requestedPath = url.searchParams.get("path");
    const activePath =
      requestedPath && session.hasFile(requestedPath)
        ? requestedPath
        : session.defaultPath;

    const htmlResponse = (body: string) =>
      new Response(body, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    const gzipResponse = (body: Uint8Array<ArrayBuffer>) =>
      new Response(body, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Encoding": "gzip",
        },
      });

    try {
      const cached = session.getCachedPage(activePath);
      if (cached) {
        return acceptGzip
          ? gzipResponse(cached.gzip)
          : htmlResponse(cached.html);
      }

      const { html, headings } = await session.getDocument(activePath);
      const comments = await session.listComments(activePath);
      const settings = await readSettings();

      const inlineData = {
        files: session.listFiles(),
        activeFile: activePath,
        settings,
        documents: { [activePath]: { headings, comments } },
        clean,
        workingDirectory: process.cwd(),
        canShare: true,
      };

      let cssPath = "";
      let jsPath: string;

      if (isDev) {
        jsPath = VITE_CLIENT_ENTRY;
      } else {
        const manifest = await getManifest();
        const entry = manifest?.["index.html"];
        jsPath = entry ? `/${entry.file}` : "/assets/index.js";
        if (entry?.css?.[0]) cssPath = `/${entry.css[0]}`;
      }

      const body = renderTemplate({
        title: basename(activePath),
        cssPath,
        jsPath,
        documentHtml: html,
        inlineData,
        isDev,
        fontFamily: settings.fontFamily,
      });

      // Dev reloads on every edit, so only pay for gzip when it is used.
      const gzip =
        !isDev || acceptGzip
          ? (Bun.gzipSync(
              new TextEncoder().encode(body),
            ) as Uint8Array<ArrayBuffer>)
          : undefined;
      if (!isDev && gzip) session.cachePage(activePath, { html: body, gzip });

      return acceptGzip && gzip ? gzipResponse(gzip) : htmlResponse(body);
    } catch (err) {
      console.error("Failed to serve app page:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  async function addDocument(req: Request): Promise<Response> {
    try {
      const { path: requestedPath } = await req.json();
      if (!requestedPath || typeof requestedPath !== "string") {
        return errorResponse("Missing 'path' field", 400);
      }

      let filePath: string;
      try {
        filePath = await canonicalizePath(requestedPath);
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

      return json({
        path: filePath,
        fileName: basename(filePath),
        status: session.addFile(filePath),
      });
    } catch (err) {
      console.error("Failed to add document:", err);
      return errorResponse("Failed to add document", 500);
    }
  }

  async function patchTask(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as {
        path?: string;
        index?: number;
        checked?: boolean;
      };
      if (
        !body?.path ||
        typeof body.index !== "number" ||
        typeof body.checked !== "boolean"
      ) {
        return errorResponse("path, index, checked required", 400);
      }

      let filePath: string;
      try {
        filePath = await canonicalizePath(body.path);
      } catch {
        return errorResponse("file not loaded", 404);
      }
      if (!session.hasFile(filePath)) {
        return errorResponse("file not loaded", 404);
      }

      const result = await session.patchTask(
        filePath,
        body.index,
        body.checked,
      );
      if (result === TaskPatchResults.OUT_OF_RANGE) {
        return errorResponse("task index out of range", 400);
      }
      return json({ status: result });
    } catch (err) {
      console.error("Failed to toggle task:", err);
      return errorResponse("toggle failed", 500);
    }
  }

  async function listComments(filePath: string): Promise<Response> {
    try {
      return json({ comments: await session.listComments(filePath) });
    } catch (err) {
      console.error("Failed to read comments:", err);
      return errorResponse("Failed to read comments", 500);
    }
  }

  async function rawComments(filePath: string): Promise<Response> {
    try {
      return json(await session.getRawComments(filePath));
    } catch (err) {
      console.error("Failed to read raw comments:", err);
      return errorResponse("Failed to read raw comments", 500);
    }
  }

  async function addComment(filePath: string, req: Request): Promise<Response> {
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

      const comment = await session.createComment(filePath, {
        selectedText,
        comment: commentText,
        startOffset,
        endOffset,
      });
      return json({ comment }, 201);
    } catch (err) {
      console.error("Failed to add comment:", err);
      return errorWithDetail("Failed to add comment", err);
    }
  }

  async function updateComment(
    filePath: string,
    req: Request,
    id: string,
  ): Promise<Response> {
    try {
      const { comment: commentText } = await req.json();
      if (typeof commentText !== "string") {
        return errorResponse("Missing comment text", 400);
      }

      const comment = await session.updateComment(filePath, id, commentText);
      if (!comment) return errorResponse("Comment not found", 404);
      return json({ comment });
    } catch (err) {
      console.error("Failed to update comment:", err);
      return errorWithDetail("Failed to update comment", err);
    }
  }

  async function deleteComment(
    filePath: string,
    id: string,
  ): Promise<Response> {
    try {
      const found = await session.deleteComment(filePath, id);
      if (!found) return errorResponse("Comment not found", 404);
      return json({ success: true });
    } catch (err) {
      console.error("Failed to delete comment:", err);
      return errorWithDetail("Failed to delete comment", err);
    }
  }

  async function clearComments(filePath: string): Promise<Response> {
    try {
      await session.deleteAllComments(filePath);
      return json({ success: true });
    } catch (err) {
      console.error("Failed to clear comments:", err);
      return errorWithDetail("Failed to clear comments", err);
    }
  }

  async function reanchorComment(
    filePath: string,
    req: Request,
    id: string,
  ): Promise<Response> {
    try {
      const { selectedText, startOffset, endOffset } = await req.json();
      if (
        !selectedText ||
        startOffset === undefined ||
        endOffset === undefined
      ) {
        return errorResponse("Missing required fields", 400);
      }

      const comment = await session.reanchor(filePath, id, {
        selectedText,
        startOffset,
        endOffset,
      });
      if (!comment) return errorResponse("Comment not found", 404);
      return json({ comment });
    } catch (err) {
      console.error("Failed to re-anchor comment:", err);
      return errorWithDetail("Failed to re-anchor comment", err);
    }
  }

  async function getShare(filePath: string): Promise<Response> {
    const configured = await loadRemote().then(
      () => true,
      () => false,
    );
    return json({ configured, share: (await loadShares())[filePath] });
  }

  async function publishShare(
    filePath: string,
    req: Request,
  ): Promise<Response> {
    const body = (await req.json().catch(() => ({}))) as {
      mode?: unknown;
      password?: unknown;
    };
    if (!isShareMode(body.mode)) {
      return errorResponse("Invalid mode", 400);
    }
    if (body.password !== undefined && typeof body.password !== "string") {
      return errorResponse("Invalid password", 400);
    }

    try {
      const record = await shareFile(filePath, {
        mode: body.mode,
        password:
          body.mode === ShareModes.PASSWORD && body.password
            ? body.password
            : undefined,
      });
      // Re-sharing merges web comments into the local file first.
      session.invalidateComments(filePath);
      return json(record);
    } catch (err) {
      console.error("Share failed:", err);
      return errorResponse(
        err instanceof Error ? err.message : "share failed",
        502,
      );
    }
  }

  async function removeShare(filePath: string): Promise<Response> {
    try {
      const record = await unshareFile(filePath);
      return json({ removed: record !== undefined });
    } catch (err) {
      console.error("Unshare failed:", err);
      return errorResponse(
        err instanceof Error ? err.message : "unshare failed",
        502,
      );
    }
  }

  async function getSettings(): Promise<Response> {
    try {
      return json(await readSettings());
    } catch (err) {
      console.error("Failed to read settings:", err);
      return errorResponse("Failed to read settings", 500);
    }
  }

  async function putSettings(req: Request): Promise<Response> {
    try {
      const { fontFamily, keybindings } = await req.json();
      if (fontFamily !== undefined && !isValidFontFamily(fontFamily)) {
        return errorResponse("Invalid font family", 400);
      }
      if (keybindings !== undefined && !isValidKeybindings(keybindings)) {
        return errorResponse("Invalid keybindings format", 400);
      }
      return json(await updateSettings({ fontFamily, keybindings }));
    } catch (err) {
      console.error("Failed to save settings:", err);
      return errorResponse("Failed to save settings", 500);
    }
  }

  /** Routes scoped to one document; the document is resolved for them once. */
  function matchFileRoute(
    pathname: string,
    method: string,
    req: Request,
  ): FileRoute | undefined {
    if (pathname === "/api/document" && method === "GET") {
      return async (filePath) => {
        const { html, headings } = await session.getDocument(filePath);
        return json({
          html,
          headings,
          filePath,
          fileName: basename(filePath),
          clean,
        });
      };
    }
    if (pathname === "/api/comments") {
      if (method === "GET") return listComments;
      if (method === "POST") return (filePath) => addComment(filePath, req);
      if (method === "DELETE") return clearComments;
    }
    if (pathname === "/api/comments/raw" && method === "GET") {
      return rawComments;
    }
    if (pathname === "/api/share") {
      if (method === "GET") return getShare;
      if (method === "POST") return (filePath) => publishShare(filePath, req);
      if (method === "DELETE") return removeShare;
    }

    const commentId = extractCommentId(pathname);
    if (!commentId) return undefined;
    if (pathname.endsWith("/reanchor") && method === "PUT") {
      return (filePath) => reanchorComment(filePath, req, commentId);
    }
    if (method === "PUT") {
      return (filePath) => updateComment(filePath, req, commentId);
    }
    if (method === "DELETE") {
      return (filePath) => deleteComment(filePath, commentId);
    }
    return undefined;
  }

  return async function fetchHandler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    if (pathname === "/api/documents" && method === "GET") {
      return json({
        files: session.listFiles(),
        clean,
        workingDirectory: process.cwd(),
      });
    }
    if (pathname === "/api/documents" && method === "POST") {
      return addDocument(req);
    }
    if (pathname === "/api/document/task" && method === "PATCH") {
      return patchTask(req);
    }
    if (pathname === "/api/document/stream" && method === "GET") {
      return documentStream();
    }
    if (pathname === "/api/health" && method === "GET") {
      return json({ status: "ok" });
    }
    if (pathname === "/api/heartbeat" && method === "GET") {
      return heartbeat();
    }

    const fileRoute = matchFileRoute(pathname, method, req);
    if (fileRoute) {
      const requested = url.searchParams.get("path") ?? session.defaultPath;
      if (!session.hasFile(requested)) {
        return errorResponse("File not found", 404);
      }
      return fileRoute(requested);
    }

    if (pathname === "/api/settings" && method === "GET") {
      return getSettings();
    }
    if (pathname === "/api/settings" && method === "PUT") {
      return putSettings(req);
    }

    if (pathname === "/") {
      return serveAppPage(req, url);
    }
    if (isDev) {
      return proxyToVite(req, pathname, url.search);
    }
    return serveStaticFile(assetsDir, pathname);
  };
}
