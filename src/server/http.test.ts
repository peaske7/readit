// @vitest-environment node
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCommentPath } from "../lib/comment-storage.js";
import { createFetchHandler } from "./http.js";
import { DocumentSession } from "./session.js";

const DOC = "# Title\n\nHello world.\n\n- [ ] task one\n";

let workspace: string;
let assetsDir: string;
let docPath: string;
let session: DocumentSession;
let fetchHandler: (req: Request) => Promise<Response>;

/** Renders without shiki/mermaid: tests care about wiring, not markdown. */
async function render(content: string) {
  return { html: `<p>${content}</p>`, headings: [] };
}

function req(
  path: string,
  init: RequestInit & { query?: Record<string, string> } = {},
): Request {
  const url = new URL(`http://localhost${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const { query: _query, ...rest } = init;
  return new Request(url, rest);
}

function open(
  options: Partial<Parameters<typeof createFetchHandler>[0]> = {},
): void {
  session = new DocumentSession({
    files: [{ filePath: docPath, content: DOC }],
    render,
  });
  fetchHandler = createFetchHandler({
    session,
    assetsDir,
    isDev: false,
    ...options,
  });
}

beforeEach(async () => {
  // Resolve symlinks (macOS's tmpdir is one) so paths match what
  // canonicalizePath() produces inside the routes under test.
  workspace = await fs.realpath(
    await fs.mkdtemp(join(os.tmpdir(), "readit-http-")),
  );
  process.env.READIT_HOME = join(workspace, "home");
  assetsDir = join(workspace, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  docPath = join(workspace, "doc.md");
  await fs.writeFile(docPath, DOC, "utf-8");
  open();
});

afterEach(async () => {
  session.close();
  process.env.READIT_HOME = undefined;
  delete process.env.READIT_HOME;
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("documents", () => {
  it("lists open files", async () => {
    const res = await fetchHandler(req("/api/documents"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.files).toEqual([{ path: docPath, fileName: "doc.md" }]);
    expect(body.clean).toBe(false);
    expect(body.workingDirectory).toBe(process.cwd());
  });

  it("adds a new file", async () => {
    const other = join(workspace, "other.md");
    await fs.writeFile(other, "# Other\n", "utf-8");

    const res = await fetchHandler(
      req("/api/documents", {
        method: "POST",
        body: JSON.stringify({ path: other }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      path: other,
      fileName: "other.md",
      status: "added",
    });
  });

  it("rejects adding a missing file", async () => {
    const res = await fetchHandler(
      req("/api/documents", {
        method: "POST",
        body: JSON.stringify({ path: join(workspace, "nope.md") }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns the rendered document", async () => {
    const res = await fetchHandler(req("/api/document"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      html: `<p>${DOC}</p>`,
      headings: [],
      filePath: docPath,
      fileName: "doc.md",
      clean: false,
    });
  });

  it("404s /api/document for an unknown path", async () => {
    const res = await fetchHandler(
      req("/api/document", { query: { path: "/nope.md" } }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "File not found" });
  });

  it("toggles a task", async () => {
    const res = await fetchHandler(
      req("/api/document/task", {
        method: "PATCH",
        body: JSON.stringify({ path: docPath, index: 0, checked: true }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(await fs.readFile(docPath, "utf-8")).toContain("- [x] task one");
  });

  it("rejects an out-of-range task index", async () => {
    const res = await fetchHandler(
      req("/api/document/task", {
        method: "PATCH",
        body: JSON.stringify({ path: docPath, index: 9, checked: true }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("reports health", async () => {
    const res = await fetchHandler(req("/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("SSE streams", () => {
  it("streams document-updated events", async () => {
    const res = await fetchHandler(req("/api/document/stream"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    // The adapter enqueues plain strings (Bun encodes them for the wire);
    // read them back as-is rather than as bytes.
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(first.value).toBe("data: connected\n\n");

    session.invalidateComments(docPath);
    const second = await reader.read();
    expect(second.value).toBe(
      `data: ${JSON.stringify({ type: "document-updated", path: docPath })}\n\n`,
    );
    await reader.cancel();
  });

  it("serves heartbeat and shuts down once idle", async () => {
    let shutdowns = 0;
    open({ onIdleShutdown: () => shutdowns++ });

    const res = await fetchHandler(req("/api/heartbeat"));
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await reader.read(); // "connected"
    await reader.cancel();

    // SHUTDOWN_DELAY_MS is 1500ms in the adapter.
    await new Promise((r) => setTimeout(r, 1700));
    expect(shutdowns).toBe(1);
  }, 5000);
});

describe("comments", () => {
  it("round-trips a comment through the API", async () => {
    const created = await fetchHandler(
      req("/api/comments", {
        method: "POST",
        body: JSON.stringify({
          selectedText: "Hello world.",
          comment: "needs work",
          startOffset: DOC.indexOf("Hello"),
          endOffset: DOC.indexOf("Hello") + "Hello world.".length,
        }),
      }),
    );
    expect(created.status).toBe(201);
    const { comment } = await created.json();
    expect(comment.comment).toBe("needs work");

    const listed = await fetchHandler(req("/api/comments"));
    expect((await listed.json()).comments).toHaveLength(1);

    const updated = await fetchHandler(
      req(`/api/comments/${comment.id}`, {
        method: "PUT",
        body: JSON.stringify({ comment: "looks good" }),
      }),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).comment.comment).toBe("looks good");

    const reanchored = await fetchHandler(
      req(`/api/comments/${comment.id}/reanchor`, {
        method: "PUT",
        body: JSON.stringify({
          selectedText: "Title",
          startOffset: DOC.indexOf("Title"),
          endOffset: DOC.indexOf("Title") + "Title".length,
        }),
      }),
    );
    expect(reanchored.status).toBe(200);
    expect((await reanchored.json()).comment.selectedText).toBe("Title");

    const raw = await fetchHandler(req("/api/comments/raw"));
    expect((await raw.json()).path).toBe(getCommentPath(docPath));

    const deleted = await fetchHandler(
      req(`/api/comments/${comment.id}`, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ success: true });

    const cleared = await fetchHandler(
      req("/api/comments", { method: "DELETE" }),
    );
    expect(cleared.status).toBe(200);
  });

  it("404s updating a comment that does not exist", async () => {
    const res = await fetchHandler(
      req("/api/comments/missing", {
        method: "PUT",
        body: JSON.stringify({ comment: "x" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Comment not found" });
  });
});

describe("settings", () => {
  it("returns default settings", async () => {
    const res = await fetchHandler(req("/api/settings"));
    expect(res.status).toBe(200);
    expect((await res.json()).fontFamily).toBeDefined();
  });

  it("persists a valid update", async () => {
    const res = await fetchHandler(
      req("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ fontFamily: "sans-serif" }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).fontFamily).toBe("sans-serif");
  });

  it("persists the theme and table modes", async () => {
    const res = await fetchHandler(
      req("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ themeMode: "light", tableMode: "wide" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.themeMode).toBe("light");
    expect(body.tableMode).toBe("wide");

    const read = await (await fetchHandler(req("/api/settings"))).json();
    expect(read.themeMode).toBe("light");
    expect(read.tableMode).toBe("wide");
  });

  it("rejects an unknown theme mode", async () => {
    const res = await fetchHandler(
      req("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ themeMode: "sepia" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid font family", async () => {
    const res = await fetchHandler(
      req("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ fontFamily: "comic-sans" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("share", () => {
  it("reports unconfigured when no remote is set up", async () => {
    const res = await fetchHandler(req("/api/share"));
    expect(res.status).toBe(200);
    expect((await res.json()).configured).toBe(false);
  });

  it("rejects an invalid share mode", async () => {
    const res = await fetchHandler(
      req("/api/share", {
        method: "POST",
        body: JSON.stringify({ mode: "not-a-mode" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("502s unsharing without a configured remote", async () => {
    const res = await fetchHandler(req("/api/share", { method: "DELETE" }));
    expect(res.status).toBe(502);
  });

  it("rejects cross-origin publish and unshare requests", async () => {
    const headers = { origin: "https://evil.example" };
    const post = await fetchHandler(
      req("/api/share", {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "link" }),
      }),
    );
    expect(post.status).toBe(403);
    const del = await fetchHandler(
      req("/api/share", { method: "DELETE", headers }),
    );
    expect(del.status).toBe(403);
  });

  it("accepts a same-origin unshare request", async () => {
    const res = await fetchHandler(
      req("/api/share", {
        method: "DELETE",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(res.status).toBe(502);
  });
});

// gzip (Bun.gzipSync) and static serving (Bun.file) run only under the
// real Bun runtime, which vitest's node/jsdom test workers don't expose
// (no `Bun` global). isDev:true takes the app page through the same
// rendering path while skipping both gzip and the manifest/static
// branches, so it is the one variant testable here; the rest is covered
// by the e2e suite against a real `bun` server.
describe("app page", () => {
  it("renders the app page at / in dev mode", async () => {
    open({ isDev: true });
    const res = await fetchHandler(req("/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const body = await res.text();
    expect(body).toContain(DOC);
  });
});
