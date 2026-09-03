/**
 * The share snapshot format: the contract between `readit share` (src/share.ts)
 * and the Worker that serves the snapshot (worker/src). Paths, asset naming,
 * the R2 object shapes, and the hosted inline data live here only, so changing
 * the format is one edit instead of two that can drift apart.
 *
 * Runs in Bun and in workerd, so nothing here may touch `node:` APIs.
 */
import type { Comment, InlineData, ShareMode } from "../schema.js";
import type { Heading } from "./headings.js";

/** A share id is 128 random bits, written as 22 base64url characters. */
const ID = "[A-Za-z0-9_-]{22}";
export const SHARE_ID = new RegExp(`^${ID}$`);

/** `/s/{id}` plus everything under it, as the Worker router matches it. */
export const SHARE_ROUTE = new RegExp(`^/s/(${ID})(/.*)?$`);

/** Where a share lives, built from the configured remote rather than a request. */
export function shareUrl(remoteUrl: string, id: string): string {
  return `${remoteUrl.replace(/\/$/, "")}/s/${id}`;
}

/** Prefix for every hosted route: the page, its assets, and its `/api`. */
export function sharePath(id: string): string {
  return `/s/${id}`;
}

/**
 * The document's path inside a share. Used as `activeFile` and as `source:` in
 * the published comments.md, so the publisher's filesystem layout never leaves
 * their machine.
 */
export function shareFilePath(id: string, fileName: string): string {
  return `/s/${id}/${fileName}`;
}

export function shareAssetPath(id: string, name: string): string {
  return `/s/${id}/assets/${name}`;
}

/**
 * Publisher API, served by worker/src/publish.ts behind the bearer token.
 *
 *   GET    SHARES_API                 list
 *   POST   SHARES_API                 create   {fileName, mode?, password?}
 *   PUT    share(id)                  replace the snapshot
 *   PATCH  share(id)                  change mode/password
 *   DELETE share(id)                  delete the share and its objects
 *   GET    shareComments(id)          raw comments.md, for `readit pull`
 *   HEAD   shareAsset(id, name)       exists?
 *   PUT    shareAsset(id, name)       upload image bytes
 */
export const SHARES_API = "/api/shares";

export function shareApiPath(id: string): string {
  return `${SHARES_API}/${id}`;
}

export function shareCommentsApiPath(id: string): string {
  return `${SHARES_API}/${id}/comments`;
}

export function shareAssetApiPath(id: string, name: string): string {
  return `${SHARES_API}/${id}/assets/${name}`;
}

/** Images are content-addressed: the first 16 hex characters of their sha256. */
export const ASSET_NAME = /^[a-f0-9]{16}\.[a-z0-9]{1,5}$/;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

const ASSET_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
};

export async function assetName(
  bytes: Uint8Array,
  extension: string,
): Promise<string> {
  // Copied into a plain ArrayBuffer view: a Node Buffer is not a BufferSource.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 16)}.${extension.toLowerCase()}`;
}

export function isAssetName(name: string): boolean {
  return ASSET_NAME.test(name);
}

/** Content type for an asset name; the extension is the only thing we know. */
export function assetContentType(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return ASSET_MIME[ext] ?? "application/octet-stream";
}

export interface PasswordRecord {
  salt: string;
  hash: string;
  iterations: number;
}

/** `shares/{id}/meta.json` */
export interface ShareMeta {
  id: string;
  fileName: string;
  hash: string;
  mode: ShareMode;
  password?: PasswordRecord;
  headings: Heading[];
  createdAt: string;
  updatedAt: string;
}

/** The text objects under `shares/{id}/`: document.html, document.md, comments.md. */
export interface ShareSnapshot {
  html: string;
  source: string;
  comments: string | undefined;
}

/** Hosted pages have no server settings to read, so the font is fixed. */
export const HOSTED_FONT_FAMILY = "serif";

/**
 * The minimal inline data a hosted page needs: the one document in the share,
 * an empty working directory, and `/api` calls prefixed with the share path.
 */
export function hostedInlineData(
  meta: ShareMeta,
  comments: Comment[],
): InlineData {
  const filePath = shareFilePath(meta.id, meta.fileName);
  return {
    files: [{ path: filePath, fileName: meta.fileName }],
    activeFile: filePath,
    clean: false,
    workingDirectory: "",
    documents: { [filePath]: { headings: meta.headings, comments } },
    settings: { version: 1, fontFamily: HOSTED_FONT_FAMILY },
    hosted: true,
    apiBase: sharePath(meta.id),
  };
}
