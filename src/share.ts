import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import {
  computeHash,
  getCommentPath,
  parseCommentFile,
  serializeComments,
} from "./lib/comment-storage.js";
import { renderMarkdown } from "./lib/markdown-renderer.js";
import { mergeComments } from "./lib/merge-comments.js";
import { disposeMermaidWorker } from "./lib/mermaid-renderer.js";
import {
  loadRemote,
  loadShares,
  type RemoteConfig,
  remoteFetch,
  type ShareRecord,
  saveShares,
} from "./remote.js";
import type { Comment } from "./schema.js";
import { sanitizeHtml } from "./template.js";

export const ShareModes = {
  PUBLIC: "public",
  LINK: "link",
  PASSWORD: "password",
} as const;
export type ShareMode = (typeof ShareModes)[keyof typeof ShareModes];

export interface ShareOptions {
  mode: ShareMode;
  password?: string;
}

const IMG_SRC = /<img\b[^>]*?\bsrc="([^"]+)"/g;
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
};

/**
 * Render locally and push a snapshot. Re-sharing the same file reuses its id,
 * so the URL is stable across edits.
 */
export async function shareFile(
  file: string,
  options: ShareOptions,
): Promise<ShareRecord> {
  const remote = await loadRemote();
  const absPath = await fs.realpath(resolve(file));
  const fileName = basename(absPath);
  const source = await fs.readFile(absPath, "utf-8");

  const shares = await loadShares();
  let record = shares[absPath];
  if (!record) {
    const res = await remoteFetch(remote, "/api/shares", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName,
        mode: options.mode,
        password: options.password,
      }),
    });
    const created = (await res.json()) as { id: string; url: string };
    record = {
      id: created.id,
      url: created.url,
      mode: options.mode,
      publishedIds: [],
    };
  }

  if (record.publishedIds.length > 0 || shares[absPath]) {
    // Re-sharing replaces the remote comments file, so take web edits first.
    const pulled = await pullComments(remote, absPath, record);
    record = pulled.record;
  }

  const rendered = await renderMarkdown(source);
  // The mermaid worker thread would otherwise keep the CLI process alive.
  disposeMermaidWorker();
  const html = await uploadImages(
    remote,
    record.id,
    dirname(absPath),
    sanitizeHtml(rendered.html),
  );
  const comments = await readLocalComments(
    absPath,
    record.id,
    fileName,
    source,
  );

  await remoteFetch(remote, `/api/shares/${record.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName,
      hash: computeHash(source),
      html,
      source,
      comments: comments?.text,
      headings: rendered.headings,
      mode: options.mode,
      password: options.password,
    }),
  });

  record = {
    ...record,
    mode: options.mode,
    publishedIds: comments?.ids ?? [],
  };
  shares[absPath] = record;
  await saveShares(shares);
  return record;
}

export async function unshareFile(
  file: string,
): Promise<ShareRecord | undefined> {
  const remote = await loadRemote();
  const absPath = await fs.realpath(resolve(file));
  const shares = await loadShares();
  const record = shares[absPath];
  if (!record) return undefined;

  await remoteFetch(remote, `/api/shares/${record.id}`, { method: "DELETE" });
  delete shares[absPath];
  await saveShares(shares);
  return record;
}

export interface PullResult {
  record: ShareRecord;
  merged: Comment[];
  /** Comments that existed on the remote but not locally. */
  added: number;
}

/**
 * Merge the share's comments into the local .comments.md (see mergeComments
 * for the rule) and record the merged ids as published.
 */
export async function pullComments(
  remote: RemoteConfig,
  absPath: string,
  record: ShareRecord,
): Promise<PullResult> {
  const res = await remoteFetch(remote, `/api/shares/${record.id}/comments`);
  const remoteText = await res.text();
  const remoteComments = remoteText
    ? parseCommentFile(remoteText).comments
    : [];

  const commentPath = getCommentPath(absPath);
  let localComments: Comment[] = [];
  try {
    localComments = parseCommentFile(
      await fs.readFile(commentPath, "utf-8"),
    ).comments;
  } catch {}

  const merged = mergeComments({
    local: localComments,
    remote: remoteComments,
    publishedIds: record.publishedIds,
  });

  if (merged.length > 0 || localComments.length > 0) {
    const source = await fs.readFile(absPath, "utf-8");
    await fs.mkdir(dirname(commentPath), { recursive: true });
    await fs.writeFile(
      commentPath,
      serializeComments({
        source: absPath,
        hash: computeHash(source),
        version: 1,
        comments: merged,
      }),
    );
  }

  const updated = { ...record, publishedIds: merged.map((c) => c.id) };
  const shares = await loadShares();
  shares[absPath] = updated;
  await saveShares(shares);

  const localIds = new Set(localComments.map((c) => c.id));
  const added = remoteComments.filter((c) => !localIds.has(c.id)).length;
  return { record: updated, merged, added };
}

/**
 * The local .comments.md with `source:` rewritten to the share path, so the
 * publisher's filesystem layout never leaves the machine.
 */
async function readLocalComments(
  absPath: string,
  shareId: string,
  fileName: string,
  source: string,
): Promise<{ text: string; ids: string[] } | undefined> {
  let content: string;
  try {
    content = await fs.readFile(getCommentPath(absPath), "utf-8");
  } catch {
    return undefined;
  }
  const file = parseCommentFile(content);
  if (file.comments.length === 0) return undefined;

  const text = serializeComments({
    source: `/s/${shareId}/${fileName}`,
    hash: computeHash(source),
    version: 1,
    comments: file.comments,
  });
  return { text, ids: file.comments.map((c) => c.id) };
}

/**
 * Upload relative images as content-addressed assets and rewrite their src.
 * Absolute URLs and data URIs are left alone; missing files warn and stay.
 */
async function uploadImages(
  remote: RemoteConfig,
  shareId: string,
  baseDir: string,
  html: string,
): Promise<string> {
  const replacements = new Map<string, string>();

  for (const match of html.matchAll(IMG_SRC)) {
    const src = match[1];
    if (replacements.has(src) || /^(https?:|data:|\/)/i.test(src)) continue;

    const localPath = resolve(baseDir, decodeURIComponent(src.split("?")[0]));
    let bytes: Uint8Array;
    try {
      bytes = await fs.readFile(localPath);
    } catch {
      console.warn(`warning: image not found, left as-is: ${src}`);
      continue;
    }

    const ext = extname(localPath).slice(1).toLowerCase();
    const digest = crypto.createHash("sha256").update(bytes).digest("hex");
    const name = `${digest.slice(0, 16)}.${ext}`;
    const assetPath = `/api/shares/${shareId}/assets/${name}`;

    const exists = await remoteFetch(remote, assetPath, {
      method: "HEAD",
    }).then(
      () => true,
      () => false,
    );
    if (!exists) {
      await remoteFetch(remote, assetPath, {
        method: "PUT",
        headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
        body: Bun.file(localPath),
      });
    }
    replacements.set(src, `/s/${shareId}/assets/${name}`);
  }

  let out = html;
  for (const [src, target] of replacements) {
    out = out.replaceAll(`src="${src}"`, `src="${target}"`);
  }
  return out;
}
