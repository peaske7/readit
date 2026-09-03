import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareModes } from "../schema";
import { createClient } from "./client";

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastRequest(fetchMock: ReturnType<typeof mockFetch>) {
  const [target, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url: String(target), init: init as RequestInit | undefined };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("url construction", () => {
  it("appends the encoded path query once per route", async () => {
    const fetchMock = mockFetch(jsonResponse({ comments: [] }));
    const client = createClient();

    await client.listComments("/tmp/my docs/a&b.md");

    expect(lastRequest(fetchMock).url).toBe(
      "/api/comments?path=%2Ftmp%2Fmy%20docs%2Fa%26b.md",
    );
  });

  it("omits the query when no path is given", async () => {
    const fetchMock = mockFetch(jsonResponse({ content: null, path: "x" }));
    const client = createClient();

    await client.getRawComments();

    expect(lastRequest(fetchMock).url).toBe("/api/comments/raw");
  });

  it("builds comment sub-routes", async () => {
    const fetchMock = mockFetch(jsonResponse({ comment: { id: "c1" } }));
    const client = createClient();

    await client.reanchor("/a.md", "c1", {
      selectedText: "hi",
      startOffset: 0,
      endOffset: 2,
    });

    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe("/api/comments/c1/reanchor?path=%2Fa.md");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(
      JSON.stringify({ selectedText: "hi", startOffset: 0, endOffset: 2 }),
    );
  });

  it("prefixes every route with the hosted base path", async () => {
    const fetchMock = mockFetch(jsonResponse({ comments: [] }));
    const client = createClient({ hosted: true, basePath: "/s/abc123" });

    await client.listComments("/a.md");
    expect(lastRequest(fetchMock).url).toBe(
      "/s/abc123/api/comments?path=%2Fa.md",
    );

    fetchMock.mockResolvedValue(jsonResponse({ html: "", headings: [] }));
    await client.getDocument();
    expect(lastRequest(fetchMock).url).toBe("/s/abc123/api/document");
  });

  it("uses the base path for event streams", () => {
    const created: string[] = [];
    vi.stubGlobal(
      "EventSource",
      class {
        constructor(url: string) {
          created.push(url);
        }
      },
    );

    createClient().heartbeat();
    createClient({ hosted: true, basePath: "/s/abc" }).documentStream();

    expect(created).toEqual(["/api/heartbeat", "/s/abc/api/document/stream"]);
    vi.unstubAllGlobals();
  });
});

describe("error convention", () => {
  it("throws the server's error field", async () => {
    mockFetch(jsonResponse({ error: "EACCES: permission denied" }, 500));
    await expect(createClient().getSettings()).rejects.toThrow(
      "EACCES: permission denied",
    );
  });

  it("falls back to statusText when the body is not JSON", async () => {
    mockFetch(
      new Response("not json", { status: 500, statusText: "Server Error" }),
    );
    await expect(createClient().getDocuments()).rejects.toThrow("Server Error");
  });

  it("falls back to a per-method message when statusText is empty", async () => {
    mockFetch(new Response("", { status: 500, statusText: "" }));
    await expect(
      createClient().createComment("/a.md", {
        selectedText: "x",
        comment: "y",
        startOffset: 0,
        endOffset: 1,
      }),
    ).rejects.toThrow("Failed to add comment");
  });

  it("unwraps the response envelope on success", async () => {
    mockFetch(jsonResponse({ comment: { id: "c1", comment: "hi" } }, 201));
    const comment = await createClient().createComment("/a.md", {
      selectedText: "x",
      comment: "hi",
      startOffset: 0,
      endOffset: 1,
    });
    expect(comment).toEqual({ id: "c1", comment: "hi" });
  });
});

describe("share", () => {
  it("reads the share status for a path", async () => {
    const fetchMock = mockFetch(jsonResponse({ configured: false }));

    const state = await createClient().getShare("/a.md");

    expect(lastRequest(fetchMock).url).toBe("/api/share?path=%2Fa.md");
    expect(state).toEqual({ configured: false });
  });

  it("publishes with the chosen mode", async () => {
    const record = { id: "abc", url: "https://md.example/s/abc", mode: "link" };
    const fetchMock = mockFetch(jsonResponse(record));

    const published = await createClient().share("/a.md", {
      mode: ShareModes.PASSWORD,
      password: "hunter2",
    });

    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe("/api/share?path=%2Fa.md");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(
      JSON.stringify({ mode: "password", password: "hunter2" }),
    );
    expect(published).toEqual(record);
  });

  it("deletes the share", async () => {
    const fetchMock = mockFetch(jsonResponse({ removed: true }));

    await createClient().unshare("/a.md");

    const { url, init } = lastRequest(fetchMock);
    expect(url).toBe("/api/share?path=%2Fa.md");
    expect(init?.method).toBe("DELETE");
  });
});

describe("capabilities", () => {
  it("a local server that can publish does everything", () => {
    expect(createClient({ canShare: true }).capabilities).toEqual({
      documentStream: true,
      heartbeat: true,
      putSettings: true,
      patchTask: true,
      addDocument: true,
      share: true,
    });
  });

  it("a local server without a share remote cannot share", () => {
    expect(createClient().capabilities.share).toBe(false);
  });

  it("hosted mode serves a read-only snapshot", () => {
    expect(createClient({ hosted: true, canShare: true }).capabilities).toEqual(
      {
        documentStream: false,
        heartbeat: false,
        putSettings: false,
        patchTask: false,
        addDocument: false,
        share: false,
      },
    );
  });

  it("exposes the base path it was configured with", () => {
    expect(createClient().basePath).toBe("");
    expect(createClient({ basePath: "/s/abc" }).basePath).toBe("/s/abc");
  });
});
