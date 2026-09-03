import { describe, expect, it } from "vitest";
import { assetName, SHARE_ID } from "../../src/lib/share-snapshot";
import { ShareModes } from "../../src/schema";
import {
  createShare,
  fetchWorker,
  ORIGIN,
  PUBLISHER,
  publishShare,
  putSnapshot,
} from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("publisher API", () => {
  it("rejects every route without the bearer token", async () => {
    expect((await fetchWorker("/api/shares")).status).toBe(401);
    expect((await fetchWorker("/api/shares", { method: "POST" })).status).toBe(
      401,
    );
    expect(
      (
        await fetchWorker("/api/shares", {
          method: "GET",
          headers: { authorization: "Bearer wrong-token" },
        })
      ).status,
    ).toBe(401);
  });

  it("creates a share with an unguessable id and its share URL", async () => {
    const res = await fetchWorker("/api/shares", {
      method: "POST",
      headers: { ...PUBLISHER, "content-type": "application/json" },
      body: JSON.stringify({ fileName: "notes.md" }),
    });
    expect(res.status).toBe(201);

    const { id, url } = (await res.json()) as { id: string; url: string };
    expect(SHARE_ID.test(id)).toBe(true);
    expect(url).toBe(`${ORIGIN}/s/${id}`);
  });

  it("requires a fileName to create", async () => {
    const res = await fetchWorker("/api/shares", {
      method: "POST",
      headers: { ...PUBLISHER, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("stores the snapshot and lists the share", async () => {
    const id = await publishShare();

    const res = await fetchWorker("/api/shares", { headers: PUBLISHER });
    const { shares } = (await res.json()) as {
      shares: { id: string; fileName: string; mode: string }[];
    };
    expect(shares).toContainEqual(
      expect.objectContaining({
        id,
        fileName: "notes.md",
        mode: ShareModes.LINK,
      }),
    );
  });

  it("rejects a snapshot without html, source, and hash", async () => {
    const id = await createShare();
    const res = await fetchWorker(`/api/shares/${id}`, {
      method: "PUT",
      headers: { ...PUBLISHER, "content-type": "application/json" },
      body: JSON.stringify({ html: "<p>x</p>" }),
    });
    expect(res.status).toBe(400);
  });

  it("404s on a snapshot for an unknown share", async () => {
    const res = await putSnapshot("AAAAAAAAAAAAAAAAAAAAAA");
    expect(res.status).toBe(404);
  });

  it("serves the raw comments.md for readit pull", async () => {
    const id = await publishShare();
    const empty = await fetchWorker(`/api/shares/${id}/comments`, {
      headers: PUBLISHER,
    });
    expect(empty.status).toBe(200);
    expect(await empty.text()).toBe("");

    await putSnapshot(id, { comments: "# comments\n" });
    const res = await fetchWorker(`/api/shares/${id}/comments`, {
      headers: PUBLISHER,
    });
    expect(await res.text()).toBe("# comments\n");
  });

  it("changes the mode with PATCH", async () => {
    const id = await publishShare();
    const res = await fetchWorker(`/api/shares/${id}`, {
      method: "PATCH",
      headers: { ...PUBLISHER, "content-type": "application/json" },
      body: JSON.stringify({ mode: ShareModes.PUBLIC }),
    });
    expect(res.status).toBe(200);

    const list = await fetchWorker("/api/shares", { headers: PUBLISHER });
    const { shares } = (await list.json()) as {
      shares: { id: string; mode: string }[];
    };
    expect(shares.find((s) => s.id === id)?.mode).toBe(ShareModes.PUBLIC);
  });

  it("refuses password mode without a password", async () => {
    const res = await fetchWorker("/api/shares", {
      method: "POST",
      headers: { ...PUBLISHER, "content-type": "application/json" },
      body: JSON.stringify({ fileName: "notes.md", mode: ShareModes.PASSWORD }),
    });
    expect(res.status).toBe(400);
  });

  it("uploads a content-addressed asset and reports whether it exists", async () => {
    const id = await publishShare();
    const name = await assetName(PNG, "png");

    const missing = await fetchWorker(`/api/shares/${id}/assets/${name}`, {
      method: "HEAD",
      headers: PUBLISHER,
    });
    expect(missing.status).toBe(404);

    const put = await fetchWorker(`/api/shares/${id}/assets/${name}`, {
      method: "PUT",
      headers: { ...PUBLISHER, "content-type": "image/png" },
      body: PNG,
    });
    expect(put.status).toBe(200);

    const found = await fetchWorker(`/api/shares/${id}/assets/${name}`, {
      method: "HEAD",
      headers: PUBLISHER,
    });
    expect(found.status).toBe(200);

    const served = await fetchWorker(`/s/${id}/assets/${name}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
  });

  it("rejects asset names that are not sha256 prefixes", async () => {
    const id = await publishShare();
    const res = await fetchWorker(`/api/shares/${id}/assets/logo.png`, {
      method: "PUT",
      headers: { ...PUBLISHER, "content-type": "image/png" },
      body: PNG,
    });
    expect(res.status).toBe(400);
  });

  it("deletes the share and everything under it", async () => {
    const id = await publishShare();
    const name = await assetName(PNG, "png");
    await fetchWorker(`/api/shares/${id}/assets/${name}`, {
      method: "PUT",
      headers: { ...PUBLISHER, "content-type": "image/png" },
      body: PNG,
    });

    const res = await fetchWorker(`/api/shares/${id}`, {
      method: "DELETE",
      headers: PUBLISHER,
    });
    expect(res.status).toBe(200);

    expect((await fetchWorker(`/s/${id}`)).status).toBe(404);
    expect((await fetchWorker(`/s/${id}/assets/${name}`)).status).toBe(404);
    expect(
      (await fetchWorker(`/api/shares/${id}`, { headers: PUBLISHER })).status,
    ).toBe(404);
  });
});
