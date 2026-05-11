import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOrThrow } from "./fetch-or-throw";

function mockFetch(response: Response) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchOrThrow", () => {
  it("returns response on 2xx", async () => {
    mockFetch(new Response("ok", { status: 200 }));
    const res = await fetchOrThrow("/api", {}, "fallback");
    expect(res.ok).toBe(true);
  });

  it("throws body.error when response is not ok and body has error field", async () => {
    mockFetch(
      new Response(JSON.stringify({ error: "EACCES: permission denied" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchOrThrow("/api", {}, "fallback")).rejects.toThrow(
      "EACCES: permission denied",
    );
  });

  it("falls back to statusText when body is not JSON", async () => {
    mockFetch(
      new Response("not json", { status: 500, statusText: "Server Error" }),
    );
    await expect(fetchOrThrow("/api", {}, "fallback")).rejects.toThrow(
      "Server Error",
    );
  });

  it("falls back to fallback message when statusText is empty", async () => {
    mockFetch(new Response("", { status: 500, statusText: "" }));
    await expect(fetchOrThrow("/api", {}, "fallback message")).rejects.toThrow(
      "fallback message",
    );
  });

  it("falls back to statusText when body is JSON but lacks error field", async () => {
    mockFetch(
      new Response(JSON.stringify({ ok: false }), {
        status: 500,
        statusText: "Internal Error",
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(fetchOrThrow("/api", {}, "fallback")).rejects.toThrow(
      "Internal Error",
    );
  });
});
