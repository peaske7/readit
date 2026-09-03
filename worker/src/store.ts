import type { ShareMeta, ShareSnapshot } from "../../src/lib/share-snapshot";

/** 128 random bits as 22 base64url characters (see SHARE_ID). */
export function newShareId(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)));
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function fromBase64url(text: string): Uint8Array {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const prefix = (id: string) => `shares/${id}/`;
const keys = {
  meta: (id: string) => `${prefix(id)}meta.json`,
  html: (id: string) => `${prefix(id)}document.html`,
  source: (id: string) => `${prefix(id)}document.md`,
  comments: (id: string) => `${prefix(id)}comments.md`,
  asset: (id: string, name: string) => `${prefix(id)}assets/${name}`,
};

const MARKDOWN = { httpMetadata: { contentType: "text/markdown" } };

async function readText(
  bucket: R2Bucket,
  key: string,
): Promise<string | undefined> {
  const obj = await bucket.get(key);
  return obj ? obj.text() : undefined;
}

export async function readMeta(
  bucket: R2Bucket,
  id: string,
): Promise<ShareMeta | undefined> {
  const text = await readText(bucket, keys.meta(id));
  return text ? (JSON.parse(text) as ShareMeta) : undefined;
}

export async function writeMeta(
  bucket: R2Bucket,
  meta: ShareMeta,
): Promise<void> {
  await bucket.put(keys.meta(meta.id), JSON.stringify(meta), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function readSnapshot(
  bucket: R2Bucket,
  id: string,
): Promise<ShareSnapshot | undefined> {
  const [html, source, comments] = await Promise.all([
    readText(bucket, keys.html(id)),
    readText(bucket, keys.source(id)),
    readText(bucket, keys.comments(id)),
  ]);
  if (html === undefined || source === undefined) return undefined;
  return { html, source, comments };
}

export async function writeSnapshot(
  bucket: R2Bucket,
  id: string,
  snapshot: ShareSnapshot,
): Promise<void> {
  await Promise.all([
    bucket.put(keys.html(id), snapshot.html, {
      httpMetadata: { contentType: "text/html" },
    }),
    bucket.put(keys.source(id), snapshot.source, MARKDOWN),
    writeComments(bucket, id, snapshot.comments),
  ]);
}

export async function readComments(
  bucket: R2Bucket,
  id: string,
): Promise<string | undefined> {
  return readText(bucket, keys.comments(id));
}

export async function writeComments(
  bucket: R2Bucket,
  id: string,
  content: string | undefined,
): Promise<void> {
  if (content === undefined) {
    await bucket.delete(keys.comments(id));
    return;
  }
  await bucket.put(keys.comments(id), content, MARKDOWN);
}

export function assetKey(id: string, name: string): string {
  return keys.asset(id, name);
}

export async function deleteShare(bucket: R2Bucket, id: string): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: prefix(id), cursor });
    if (page.objects.length > 0) {
      await bucket.delete(page.objects.map((o) => o.key));
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export async function listShares(bucket: R2Bucket): Promise<ShareMeta[]> {
  const page = await bucket.list({ prefix: "shares/", delimiter: "/" });
  const ids = page.delimitedPrefixes.map((p) => p.slice("shares/".length, -1));
  const metas = await Promise.all(ids.map((id) => readMeta(bucket, id)));
  return metas.filter((m): m is ShareMeta => m !== undefined);
}
