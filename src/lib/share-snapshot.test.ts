import { describe, expect, it } from "vitest";
import type { Comment } from "../schema.js";
import { ShareModes } from "../schema.js";
import {
  assetContentType,
  assetName,
  hostedInlineData,
  isAssetName,
  SHARE_ROUTE,
  type ShareMeta,
  shareApiPath,
  shareAssetApiPath,
  shareAssetPath,
  shareCommentsApiPath,
  shareFilePath,
  sharePath,
  shareUrl,
} from "./share-snapshot.js";

const ID = "AAAAAAAAAAAAAAAAAAAAAA";

const meta: ShareMeta = {
  id: ID,
  fileName: "notes.md",
  hash: "0123456789abcdef",
  mode: ShareModes.LINK,
  headings: [{ id: "intro", text: "Intro", level: 1 }],
  createdAt: "2026-09-02T00:00:00.000Z",
  updatedAt: "2026-09-02T01:00:00.000Z",
};

describe("asset naming", () => {
  it("names an asset after the first 16 hex chars of its sha256", async () => {
    // sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const bytes = new TextEncoder().encode("hello");
    expect(await assetName(bytes, "png")).toBe("2cf24dba5fb0a30e.png");
  });

  it("lowercases the extension so the name matches the validation regex", async () => {
    const name = await assetName(new TextEncoder().encode("hello"), "PNG");
    expect(name).toBe("2cf24dba5fb0a30e.png");
    expect(isAssetName(name)).toBe(true);
  });

  it("rejects names the publisher must not upload", async () => {
    expect(isAssetName("2cf24dba5fb0a30e.png")).toBe(true);
    expect(isAssetName("2cf24dba5fb0a30e.")).toBe(false);
    expect(isAssetName("2cf24dba5fb0a30e.tarball")).toBe(false);
    expect(isAssetName("../../etc/passwd")).toBe(false);
    expect(isAssetName("2CF24DBA5FB0A30E.png")).toBe(false);
    expect(isAssetName("2cf24dba5fb0a30.png")).toBe(false);
  });

  it("maps extensions to content types, falling back to octet-stream", () => {
    expect(assetContentType("2cf24dba5fb0a30e.png")).toBe("image/png");
    expect(assetContentType("2cf24dba5fb0a30e.JPG")).toBe("image/jpeg");
    expect(assetContentType("2cf24dba5fb0a30e.svg")).toBe("image/svg+xml");
    expect(assetContentType("2cf24dba5fb0a30e.bin")).toBe(
      "application/octet-stream",
    );
  });
});

describe("share paths", () => {
  it("builds the share URL from the remote, without a double slash", () => {
    expect(shareUrl("https://md.peas.ke", ID)).toBe(
      `https://md.peas.ke/s/${ID}`,
    );
    expect(shareUrl("https://md.peas.ke/", ID)).toBe(
      `https://md.peas.ke/s/${ID}`,
    );
  });

  it("rewrites the document path to the share, hiding the local path", () => {
    expect(shareFilePath(ID, "notes.md")).toBe(`/s/${ID}/notes.md`);
    expect(sharePath(ID)).toBe(`/s/${ID}`);
    expect(shareAssetPath(ID, "2cf24dba5fb0a30e.png")).toBe(
      `/s/${ID}/assets/2cf24dba5fb0a30e.png`,
    );
  });

  it("builds publisher API paths", () => {
    expect(shareApiPath(ID)).toBe(`/api/shares/${ID}`);
    expect(shareCommentsApiPath(ID)).toBe(`/api/shares/${ID}/comments`);
    expect(shareAssetApiPath(ID, "a.png")).toBe(
      `/api/shares/${ID}/assets/a.png`,
    );
  });

  it("matches viewer routes and splits off the rest of the path", () => {
    expect(`/s/${ID}`.match(SHARE_ROUTE)?.[1]).toBe(ID);
    const nested = `/s/${ID}/api/comments`.match(SHARE_ROUTE);
    expect(nested?.[1]).toBe(ID);
    expect(nested?.[2]).toBe("/api/comments");
    expect(SHARE_ROUTE.test("/s/tooshort")).toBe(false);
    expect(SHARE_ROUTE.test(`/s/${ID}x`)).toBe(false);
  });
});

describe("share meta", () => {
  it("survives a JSON round trip through R2", () => {
    expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
  });

  it("keeps the password record when there is one", () => {
    const locked: ShareMeta = {
      ...meta,
      mode: ShareModes.PASSWORD,
      password: { salt: "c2FsdA", hash: "aGFzaA", iterations: 100_000 },
    };
    expect(JSON.parse(JSON.stringify(locked))).toEqual(locked);
  });
});

describe("hostedInlineData", () => {
  const comments: Comment[] = [];
  const data = hostedInlineData(meta, comments);

  it("points every path at the share, not at the publisher's disk", () => {
    const filePath = shareFilePath(ID, meta.fileName);
    expect(data.activeFile).toBe(filePath);
    expect(data.files).toEqual([{ path: filePath, fileName: meta.fileName }]);
    expect(data.documents[filePath].headings).toEqual(meta.headings);
    expect(data.workingDirectory).toBe("");
  });

  it("puts the app in hosted mode behind the share's api base", () => {
    expect(data.hosted).toBe(true);
    expect(data.apiBase).toBe(sharePath(ID));
    expect(data.clean).toBe(false);
  });
});
