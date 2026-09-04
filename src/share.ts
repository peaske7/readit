import * as fs from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import {
  computeHash,
  getCommentPath,
  parseCommentFile,
  serializeComments,
} from "./lib/comment-storage.js";
import { renderMarkdown } from "./lib/markdown-renderer.js";
import { mergeComments } from "./lib/merge-comments.js";
import {
  assetContentType,
  assetName,
  isAssetName,
  SHARES_API,
  shareApiPath,
  shareAssetApiPath,
  shareAssetPath,
  shareCommentsApiPath,
  shareFilePath,
  shareUrl,
} from "./lib/share-snapshot.js";
import {
  loadRemote,
  loadShares,
  type RemoteConfig,
  remoteFetch,
  type ShareRecord,
  saveShares,
} from "./remote.js";
import { type Comment, type ShareMode, ShareModes } from "./schema.js";
import { sanitizeHtml } from "./template.js";

export { type ShareMode, ShareModes };

export interface ShareOptions {
  mode: ShareMode;
  password?: string;
}

const IMG_SRC = /<img\b[^>]*?\bsrc="([^"]+)"/g;

/**
 * Render locally and push a snapshot. Re-sharing the same file reuses its id,
 * so the URL is stable across edits. The shares registry is read once here and
 * written once at the end.
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
  const existing = shares[absPath];
  // Re-sharing replaces the remote comments file, so take web edits first.
  const record = existing
    ? (await mergeRemoteComments(remote, absPath, existing)).record
    : await createShare(remote, fileName, options);

  const rendered = await renderMarkdown(source);
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

  await remoteFetch(remote, shareApiPath(record.id), {
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

  const published: ShareRecord = {
    ...record,
    mode: options.mode,
    publishedIds: comments?.ids ?? [],
  };
  shares[absPath] = published;
  await saveShares(shares);
  return published;
}

async function createShare(
  remote: RemoteConfig,
  fileName: string,
  options: ShareOptions,
): Promise<ShareRecord> {
  const res = await remoteFetch(remote, SHARES_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName,
      mode: options.mode,
      password: options.password,
    }),
  });
  const created = (await res.json()) as { id: string };
  return {
    id: created.id,
    // Built from the configured remote so a proxy or dev host never leaks in.
    url: shareUrl(remote.url, created.id),
    mode: options.mode,
    publishedIds: [],
  };
}

export async function unshareFile(
  file: string,
): Promise<ShareRecord | undefined> {
  const remote = await loadRemote();
  const absPath = await fs.realpath(resolve(file));
  const shares = await loadShares();
  const record = shares[absPath];
  if (!record) return undefined;

  await remoteFetch(remote, shareApiPath(record.id), { method: "DELETE" });
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
 * Merge the share's comments into the local .comments.md and record the merged
 * ids as published. `readit share` calls mergeRemoteComments directly so the
 * registry is still written only once for the whole publish.
 */
export async function pullComments(
  remote: RemoteConfig,
  absPath: string,
  record: ShareRecord,
): Promise<PullResult> {
  const result = await mergeRemoteComments(remote, absPath, record);
  const shares = await loadShares();
  shares[absPath] = result.record;
  await saveShares(shares);
  return result;
}

/** The merge itself (see mergeComments for the rule); touches no registry. */
async function mergeRemoteComments(
  remote: RemoteConfig,
  absPath: string,
  record: ShareRecord,
): Promise<PullResult> {
  const res = await remoteFetch(remote, shareCommentsApiPath(record.id));
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

  const localIds = new Set(localComments.map((c) => c.id));
  const added = remoteComments.filter((c) => !localIds.has(c.id)).length;
  return {
    record: { ...record, publishedIds: merged.map((c) => c.id) },
    merged,
    added,
  };
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
    source: shareFilePath(shareId, fileName),
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
/** True when `target` (already a real path) sits under `root`. */
function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

async function uploadImages(
  remote: RemoteConfig,
  shareId: string,
  baseDir: string,
  html: string,
): Promise<string> {
  const replacements = new Map<string, string>();
  // A document written by someone else must not be able to make `readit
  // share` publish files from elsewhere on the machine via `../` or symlinks.
  const roots = [baseDir, await fs.realpath(process.cwd())];

  for (const match of html.matchAll(IMG_SRC)) {
    const src = match[1];
    if (replacements.has(src) || /^(https?:|data:|\/)/i.test(src)) continue;

    const localPath = resolve(baseDir, decodeURIComponent(src.split("?")[0]));
    let bytes: Uint8Array;
    try {
      const real = await fs.realpath(localPath);
      if (!roots.some((root) => isWithin(root, real))) {
        console.warn(
          `warning: image outside the document directory, left as-is: ${src}`,
        );
        continue;
      }
      bytes = await fs.readFile(real);
    } catch {
      console.warn(`warning: image not found, left as-is: ${src}`);
      continue;
    }

    const name = await assetName(bytes, extname(localPath).slice(1));
    if (!isAssetName(name)) {
      console.warn(`warning: unsupported image extension, left as-is: ${src}`);
      continue;
    }

    const assetPath = shareAssetApiPath(shareId, name);
    const exists = await remoteFetch(remote, assetPath, {
      method: "HEAD",
    }).then(
      () => true,
      () => false,
    );
    if (!exists) {
      await remoteFetch(remote, assetPath, {
        method: "PUT",
        headers: { "content-type": assetContentType(name) },
        body: new Uint8Array(bytes),
      });
    }
    replacements.set(src, shareAssetPath(shareId, name));
  }

  let out = html;
  for (const [src, target] of replacements) {
    out = out.replaceAll(`src="${src}"`, `src="${target}"`);
  }
  return out;
}
