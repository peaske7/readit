import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Client,
  type ClientCapabilities,
  configureClient,
  setClient,
} from "../lib/client";
import type { Comment, DocumentSettings } from "../schema";
import {
  addComment,
  app,
  bootstrap,
  deleteComment,
  hydrateFromInlineData,
  openDocument,
  startDocumentStream,
  stopDocumentStream,
  updateComment,
} from "./app.svelte";

/** A stand-in EventSource the tests drive by hand, without a real browser. */
class FakeEventSource {
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

function fakeCapabilities(
  overrides?: Partial<ClientCapabilities>,
): ClientCapabilities {
  return {
    documentStream: true,
    heartbeat: true,
    putSettings: true,
    patchTask: true,
    share: false,
    ...overrides,
  };
}

function createFakeClient(overrides?: Partial<Client>): Client {
  return {
    capabilities: fakeCapabilities(),
    basePath: "",
    getDocuments: vi.fn(async () => ({ files: [], clean: false })),
    getDocument: vi.fn(async (path?: string) => ({
      html: "<p>hi</p>",
      headings: [],
      filePath: path ?? "",
      fileName: "",
      clean: false,
    })),
    listComments: vi.fn(async (): Promise<Comment[]> => []),
    createComment: vi.fn(
      async (_path: string, input): Promise<Comment> => ({
        id: "server-id",
        ...input,
      }),
    ),
    updateComment: vi.fn(
      async (_path: string, id: string, comment: string): Promise<Comment> => ({
        id,
        comment,
        selectedText: "x",
        startOffset: 0,
        endOffset: 1,
      }),
    ),
    deleteComment: vi.fn(async () => {}),
    deleteAllComments: vi.fn(async () => {}),
    reanchor: vi.fn(
      async (_path: string, id: string, anchor): Promise<Comment> => ({
        id,
        comment: "",
        ...anchor,
      }),
    ),
    getRawComments: vi.fn(async () => ({ content: null, path: "" })),
    getSettings: vi.fn(
      async (): Promise<DocumentSettings> => ({
        version: 1,
        fontFamily: "serif",
      }),
    ),
    putSettings: vi.fn(
      async (): Promise<DocumentSettings> => ({
        version: 1,
        fontFamily: "serif",
      }),
    ),
    patchTask: vi.fn(async () => {}),
    getShare: vi.fn(async () => ({ configured: false })),
    share: vi.fn(async () => ({ id: "s1", url: "", mode: "link" })),
    unshare: vi.fn(async () => {}),
    documentStream: vi.fn(
      () => new FakeEventSource() as unknown as EventSource,
    ),
    heartbeat: vi.fn(() => new FakeEventSource() as unknown as EventSource),
    ...overrides,
  };
}

function resetStore(): void {
  app.documents = new Map();
  app.activeDocumentPath = null;
  app.documentOrder = [];
  app.workingDirectory = null;
  app.hosted = false;
  app.initialized = false;
  app.loadError = null;
}

/** Seeds a document with content already loaded, so no fetch is triggered. */
function seedDocument(path: string, comments: Comment[] = []): void {
  hydrateFromInlineData({
    files: [{ path, fileName: path }],
    activeFile: path,
    clean: false,
    workingDirectory: "/",
    documents: {
      [path]: { html: "<p>seed</p>", headings: [], comments },
    },
    settings: { version: 1, fontFamily: "serif" },
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  stopDocumentStream();
  configureClient({});
});

describe("bootstrap", () => {
  it("loads the document list and the active document's content and comments", async () => {
    const fake = createFakeClient({
      getDocuments: vi.fn(async () => ({
        files: [{ path: "/a.md", fileName: "a.md" }],
        clean: false,
      })),
      getDocument: vi.fn(async () => ({
        html: "<p>hello</p>",
        headings: [],
        filePath: "/a.md",
        fileName: "a.md",
        clean: false,
      })),
      listComments: vi.fn(async () => [
        {
          id: "c1",
          selectedText: "hello",
          comment: "note",
          startOffset: 0,
          endOffset: 5,
        },
      ]),
    });
    setClient(fake);

    await bootstrap();

    expect(app.initialized).toBe(true);
    expect(app.documentOrder).toEqual(["/a.md"]);
    expect(app.activeDocumentPath).toBe("/a.md");

    await vi.waitFor(() => {
      expect(app.documents.get("/a.md")?.document.html).toBe("<p>hello</p>");
    });
    expect(app.documents.get("/a.md")?.comments).toHaveLength(1);
  });

  it("is a no-op once documents are already hydrated", async () => {
    seedDocument("/already.md");
    const fake = createFakeClient();
    setClient(fake);

    await bootstrap();

    expect(app.initialized).toBe(true);
    expect(fake.getDocuments).not.toHaveBeenCalled();
  });

  it("records an error and still marks initialized on failure", async () => {
    const fake = createFakeClient({
      getDocuments: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    setClient(fake);

    await bootstrap();

    expect(app.initialized).toBe(true);
    expect(app.loadError).toBe("offline");
  });
});

describe("addComment", () => {
  it("applies the comment optimistically, then replaces it with the server's copy", async () => {
    const fake = createFakeClient({
      createComment: vi.fn(async () => ({
        id: "server-1",
        selectedText: "hello",
        comment: "note",
        startOffset: 0,
        endOffset: 5,
      })),
    });
    setClient(fake);
    seedDocument("/a.md");

    const ok = await addComment("/a.md", "hello", "note", 0, 5);

    expect(ok).toBe(true);
    const comments = app.documents.get("/a.md")?.comments ?? [];
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe("server-1");
  });

  it("rolls back the optimistic comment when the server rejects it", async () => {
    const fake = createFakeClient({
      createComment: vi.fn(async () => {
        throw new Error("network down");
      }),
    });
    setClient(fake);
    seedDocument("/a.md");

    const ok = await addComment("/a.md", "hello", "note", 0, 5);

    expect(ok).toBe(false);
    expect(app.documents.get("/a.md")?.comments).toEqual([]);
    expect(app.documents.get("/a.md")?.commentsError).toBe("network down");
  });
});

describe("updateComment and deleteComment", () => {
  it("round-trip through the client and update the store", async () => {
    const fake = createFakeClient();
    setClient(fake);
    seedDocument("/a.md", [
      {
        id: "c1",
        selectedText: "hi",
        comment: "old",
        startOffset: 0,
        endOffset: 2,
      },
    ]);

    await updateComment("/a.md", "c1", "new text");

    expect(fake.updateComment).toHaveBeenCalledWith("/a.md", "c1", "new text");
    expect(app.documents.get("/a.md")?.comments[0]?.comment).toBe("new text");

    await deleteComment("/a.md", "c1");

    expect(fake.deleteComment).toHaveBeenCalledWith("/a.md", "c1");
    expect(app.documents.get("/a.md")?.comments).toEqual([]);
  });
});

describe("live updates (SSE)", () => {
  it("does not open a stream when the documentStream capability is false", () => {
    const fake = createFakeClient({
      capabilities: fakeCapabilities({ documentStream: false }),
    });
    setClient(fake);

    startDocumentStream();

    expect(fake.documentStream).not.toHaveBeenCalled();
  });

  it("'document-updated' refetches document and comments for that path only", async () => {
    const stream = new FakeEventSource();
    const fake = createFakeClient({
      documentStream: vi.fn(() => stream as unknown as EventSource),
      getDocument: vi.fn(async (path?: string) => ({
        html: `<p>updated ${path}</p>`,
        headings: [],
        filePath: path ?? "",
        fileName: "",
        clean: false,
      })),
      listComments: vi.fn(async () => []),
    });
    setClient(fake);
    hydrateFromInlineData({
      files: [
        { path: "/a.md", fileName: "a.md" },
        { path: "/b.md", fileName: "b.md" },
      ],
      activeFile: "/a.md",
      clean: false,
      workingDirectory: "/",
      documents: {
        "/a.md": { html: "<p>a</p>", headings: [], comments: [] },
        "/b.md": { html: "<p>b</p>", headings: [], comments: [] },
      },
      settings: { version: 1, fontFamily: "serif" },
    });

    startDocumentStream();
    stream.emit({ type: "document-updated", path: "/a.md" });

    await vi.waitFor(() => {
      expect(app.documents.get("/a.md")?.document.html).toBe(
        "<p>updated /a.md</p>",
      );
    });
    expect(app.documents.get("/b.md")?.document.html).toBe("<p>b</p>");
    expect(fake.getDocument).toHaveBeenCalledExactlyOnceWith("/a.md");
    expect(fake.listComments).toHaveBeenCalledExactlyOnceWith("/a.md");
  });

  it("'document-added' appends a new tab without activating it", () => {
    const stream = new FakeEventSource();
    const fake = createFakeClient({
      documentStream: vi.fn(() => stream as unknown as EventSource),
    });
    setClient(fake);
    seedDocument("/a.md");

    startDocumentStream();
    stream.emit({
      type: "document-added",
      path: "/new.md",
      fileName: "new.md",
    });

    expect(app.documentOrder).toEqual(["/a.md", "/new.md"]);
    expect(app.documents.has("/new.md")).toBe(true);
    expect(app.activeDocumentPath).toBe("/a.md");
  });
});

describe("openDocument", () => {
  it("keeps an already-open document's state when reopened", () => {
    seedDocument("/a.md", [
      {
        id: "c1",
        selectedText: "hi",
        comment: "note",
        startOffset: 0,
        endOffset: 2,
      },
    ]);

    openDocument(
      { html: "", filePath: "/a.md", fileName: "a.md", clean: false },
      { active: false },
    );

    expect(app.documentOrder).toEqual(["/a.md"]);
    expect(app.documents.get("/a.md")?.comments).toHaveLength(1);
  });
});
