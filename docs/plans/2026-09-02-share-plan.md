# Share to Cloudflare — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish a readit document to a self-hosted Cloudflare Worker with `public`, `link`, or `password` access, let viewers read and comment in the unchanged Svelte UI, and merge web comments back into the local `.comments.md`.

**Architecture:** The Worker is a third readit server whose filesystem is R2. The Bun CLI renders locally and pushes a snapshot (`document.html`, `document.md`, `comments.md`, `meta.json`, content-addressed images) under `shares/{id}/`. The Worker reuses `src/template.ts`, `src/lib/anchor.ts`, `src/lib/html-text.ts`, `src/lib/highlight/resolver.ts`, and `src/lib/comment-storage.ts` unchanged (via `nodejs_compat`), and serves the Vite bundle as Worker static assets. The frontend gets one `hosted` flag and an `apiBase` prefix. Publisher auth is a bearer token in a Worker secret; viewer auth is the share mode, with PBKDF2 passwords and an HMAC-signed path-scoped cookie.

**Tech Stack:** Bun, Commander.js, Cloudflare Workers + R2 + static assets + rate limiting binding, wrangler, Svelte 5, existing markdown-it/shiki/mermaid renderer.

**Design doc:** `docs/plans/2026-09-02-share-design.md`

---

### Task 1: Extract comment resolution into a shared module

The anchor-resolution loop lives inside `readCommentsFromFile` in `src/server.ts:102-142`. The Worker needs the same loop without the filesystem cache around it.

**Files:**
- Create: `src/lib/resolve-comments.ts`
- Modify: `src/server.ts`

**Step 1: Create `src/lib/resolve-comments.ts`**

```ts
import { AnchorConfidences, type Comment } from "../schema";
import { findAnchorWithFallback } from "./anchor";
import { findTextPosition } from "./highlight/resolver";
import { extractTextFromHtml } from "./html-text";

export function resolveComments({
  comments,
  source,
  html,
}: {
  comments: Comment[];
  source: string;
  html?: string;
}): Comment[] {
  const domText = html ? extractTextFromHtml(html) : null;

  return comments.map((comment) => {
    const textForMatching = comment.anchorPrefix || comment.selectedText;

    const anchor = findAnchorWithFallback({
      source,
      selectedText: textForMatching,
      lineHint: comment.lineHint || "L1",
    });

    if (!anchor) {
      return { ...comment, anchorConfidence: AnchorConfidences.UNRESOLVED };
    }

    let startOffset = anchor.start;
    let endOffset = anchor.end;

    if (domText) {
      const domPos = findTextPosition(domText, comment.selectedText, anchor.start);
      if (domPos) {
        startOffset = domPos.start;
        endOffset = domPos.end;
      }
    }

    return {
      ...comment,
      startOffset,
      endOffset,
      lineHint: `L${anchor.line}`,
      anchorConfidence: anchor.confidence,
    };
  });
}
```

**Step 2: Use it in `src/server.ts`**

In `readCommentsFromFile`, replace the block from `const domText = ...` through the end of the `file.comments.map(...)` call with:

```ts
const resolvedComments = resolveComments({
  comments: file.comments,
  source: sourceContent,
  html: renderedHtml,
});
```

Add the import and remove the now-unused imports of `findAnchorWithFallback`, `findTextPosition`, and `extractTextFromHtml` if nothing else in the file uses them.

**Step 3: Verify**

Run: `bun run typecheck && bun run test`
Expected: No errors, all tests pass

**Step 4: Commit**

```bash
git add src/lib/resolve-comments.ts src/server.ts
git commit -m "refactor: extract resolveComments for reuse"
```

---

### Task 2: Hosted mode in the frontend

The Svelte app hardcodes `/api/...` URLs and assumes a live server. Add an API base prefix and a `hosted` flag that disables server-only behavior.

**Files:**
- Create: `src/lib/api.ts`
- Modify: `src/schema.ts`, `src/main.ts`, `src/App.svelte`, `src/stores/app.svelte.ts`, `src/stores/connection.svelte.ts`, `src/stores/settings.svelte.ts`, `src/stores/shortcuts.svelte.ts`, `src/components/RawModal.svelte`, `src/components/DocumentViewer.svelte`

**Step 1: Create `src/lib/api.ts`**

```ts
let apiBase = "";

export function setApiBase(base: string): void {
  apiBase = base;
}

export function apiUrl(path: string): string {
  return `${apiBase}${path}`;
}
```

**Step 2: Move `InlineData` to `src/schema.ts` and extend it**

`InlineData` is a local, unexported interface in `src/stores/app.svelte.ts:16`. Move it (and the `InlineDocData` shape it references) into `src/schema.ts`, export both, and import them back in the store. Then add two optional fields:

```ts
hosted?: boolean;
apiBase?: string;
```

The Worker imports this type in Task 6, so the export matters.

**Step 3: Add `hosted` to the app store**

In `src/stores/app.svelte.ts`, add `hosted: false` to the `app` state object, and in `hydrateFromInlineData` set:

```ts
app.hosted = data.hosted ?? false;
```

**Step 4: Set the base in `src/main.ts`**

Before `hydrateFromInlineData(data)`:

```ts
setApiBase(data.apiBase ?? "");
```

**Step 5: Route every request through `apiUrl`**

Replace each literal in these call sites, wrapping the string in `apiUrl(...)`:

- `src/App.svelte:92` (`/api/document/task`), `:469` (`/api/documents`), `:539-540`, `:580`, `:586`, `:589`, `:609`, `:615`, and the `POST /api/comments`, `PUT`, `DELETE`, and `reanchor` calls near `:130`, `:176`, `:206`, `:229`, `:271`
- `src/App.svelte:501` — `new EventSource(apiUrl("/api/document/stream"))`
- `src/stores/connection.svelte.ts:19` — `new EventSource(apiUrl("/api/heartbeat"))`
- `src/stores/settings.svelte.ts:60` and `src/stores/shortcuts.svelte.ts:91` — `fetch(apiUrl("/api/settings"), ...)`
- `src/components/RawModal.svelte:37`

Run `grep -rn '"/api\|`/api' src/` afterwards; the only remaining matches must be inside `apiUrl(...)`.

**Step 6: Skip live connections when hosted**

In `src/App.svelte` `onMount`:

```ts
if (!app.hosted) {
  startHeartbeat();
  setupDocumentStream();
}
```

**Step 7: Persist settings locally when hosted**

In `src/stores/settings.svelte.ts` `updateFontFamily`, before the `fetch`:

```ts
if (app.hosted) {
  try {
    localStorage.setItem("readit:fontFamily", font);
  } catch {}
  return;
}
```

In `initSettings`, when reading the inline settings, prefer `localStorage.getItem("readit:fontFamily")` if it is a valid `FontFamily`. Apply the same pattern in `src/stores/shortcuts.svelte.ts` with the key `readit:keybindings` (JSON array).

**Step 8: Disable task checkboxes when hosted**

In `src/components/DocumentViewer.svelte`, in the effect that adopts the article node, after adoption:

```ts
if (app.hosted) {
  for (const box of articleEl.querySelectorAll<HTMLElement>(".task-checkbox")) {
    box.setAttribute("aria-disabled", "true");
    box.classList.add("pointer-events-none", "opacity-70");
  }
}
```

**Step 9: Verify**

Run: `bun run typecheck && bun run check && bun run test`
Expected: No errors

Run: `bun dev test.md` and open the browser
Expected: local mode unchanged, heartbeat and stream still connect, comments still save

**Step 10: Commit**

```bash
git add src/lib/api.ts src/schema.ts src/main.ts src/App.svelte src/stores src/components/RawModal.svelte src/components/DocumentViewer.svelte
git commit -m "feat: hosted mode and API base prefix in frontend"
```

---

### Task 3: Worker scaffold

**Files:**
- Create: `worker/wrangler.toml`, `worker/tsconfig.json`, `worker/src/index.ts`, `worker/src/env.ts`, `worker/src/http.ts`
- Modify: `package.json`, `.gitignore`

**Step 1: Install tooling**

Run: `bun add -d wrangler @cloudflare/workers-types`

**Step 2: Create `worker/wrangler.toml`**

```toml
name = "readit-share"
main = "src/index.ts"
compatibility_date = "2026-09-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./public"
binding = "ASSETS"
run_worker_first = true

[[r2_buckets]]
binding = "SHARES"
bucket_name = "readit-shares"

[[ratelimits]]
name = "UNLOCK_LIMITER"
namespace_id = "1001"
simple = { limit = 5, period = 60 }
```

Secrets are set out of band: `wrangler secret put PUBLISH_TOKEN` and `wrangler secret put COOKIE_SECRET`.

**Step 3: Create `worker/tsconfig.json`**

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "types": ["@cloudflare/workers-types", "node"],
    "lib": ["ES2022"]
  },
  "include": ["src", "../src/lib", "../src/schema.ts", "../src/template.ts"]
}
```

**Step 4: Create `worker/src/env.ts`**

```ts
export interface Env {
  SHARES: R2Bucket;
  ASSETS: Fetcher;
  UNLOCK_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  PUBLISH_TOKEN: string;
  COOKIE_SECRET: string;
}
```

**Step 5: Create `worker/src/http.ts`**

```ts
export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function errorWithDetail(message: string, err: unknown, status = 500): Response {
  const detail = err instanceof Error ? err.message : String(err);
  return errorResponse(`${message}: ${detail}`, status);
}
```

**Step 6: Create `worker/src/index.ts`**

```ts
import type { Env } from "./env";
import { json } from "./http";
import { handlePublish } from "./publish";
import { handleShare } from "./view";

const SHARE_PATH = /^\/s\/([A-Za-z0-9_-]{22})(\/.*)?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname.startsWith("/assets/")) {
      return env.ASSETS.fetch(request);
    }
    if (pathname === "/api/health") {
      return json({ status: "ok" });
    }
    if (pathname === "/api/shares" || pathname.startsWith("/api/shares/")) {
      return handlePublish(request, env, url);
    }

    const match = pathname.match(SHARE_PATH);
    if (match) {
      return handleShare(request, env, url, match[1], match[2] ?? "");
    }

    return new Response("Not found", { status: 404 });
  },
};
```

`publish.ts` and `view.ts` are created in Tasks 5 and 6; add stub exports returning 501 so this compiles now.

**Step 7: Build script and ignores**

Add to `package.json` scripts:

```json
"build:worker": "bun run build && rm -rf worker/public && mkdir -p worker/public && cp -r dist/assets worker/public/assets && cp dist/.vite/manifest.json worker/src/manifest.json",
"worker:dev": "bun run build:worker && cd worker && wrangler dev",
"worker:deploy": "bun run build:worker && cd worker && wrangler deploy",
"typecheck:worker": "tsc -p worker/tsconfig.json"
```

Append to `.gitignore`:

```
worker/public
worker/src/manifest.json
.wrangler
```

**Step 8: Verify**

Run: `bun run build:worker && bun run typecheck:worker`
Expected: No errors

Run: `cd worker && wrangler dev` then `curl localhost:8787/api/health`
Expected: `{"status":"ok"}`

**Step 9: Commit**

```bash
git add worker package.json bun.lock .gitignore
git commit -m "feat(worker): scaffold readit share worker"
```

---

### Task 4: Share store and auth primitives

**Files:**
- Create: `worker/src/store.ts`, `worker/src/auth.ts`

**Step 1: Create `worker/src/store.ts`**

```ts
import type { Heading } from "../../src/lib/headings";

export const ShareModes = {
  PUBLIC: "public",
  LINK: "link",
  PASSWORD: "password",
} as const;
export type ShareMode = (typeof ShareModes)[keyof typeof ShareModes];

export interface PasswordRecord {
  salt: string;
  hash: string;
  iterations: number;
}

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

export interface ShareSnapshot {
  html: string;
  source: string;
  comments: string | undefined;
}

export function isShareMode(value: unknown): value is ShareMode {
  return value === ShareModes.PUBLIC || value === ShareModes.LINK || value === ShareModes.PASSWORD;
}

export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return base64url(bytes);
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

const prefix = (id: string) => `shares/${id}/`;
const keys = {
  meta: (id: string) => `${prefix(id)}meta.json`,
  html: (id: string) => `${prefix(id)}document.html`,
  source: (id: string) => `${prefix(id)}document.md`,
  comments: (id: string) => `${prefix(id)}comments.md`,
  asset: (id: string, name: string) => `${prefix(id)}assets/${name}`,
};

async function readText(bucket: R2Bucket, key: string): Promise<string | undefined> {
  const obj = await bucket.get(key);
  return obj ? obj.text() : undefined;
}

export async function readMeta(bucket: R2Bucket, id: string): Promise<ShareMeta | undefined> {
  const text = await readText(bucket, keys.meta(id));
  return text ? (JSON.parse(text) as ShareMeta) : undefined;
}

export async function writeMeta(bucket: R2Bucket, meta: ShareMeta): Promise<void> {
  await bucket.put(keys.meta(meta.id), JSON.stringify(meta), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function readSnapshot(bucket: R2Bucket, id: string): Promise<ShareSnapshot | undefined> {
  const [html, source, comments] = await Promise.all([
    readText(bucket, keys.html(id)),
    readText(bucket, keys.source(id)),
    readText(bucket, keys.comments(id)),
  ]);
  if (html === undefined || source === undefined) return undefined;
  return { html, source, comments };
}

export async function writeSnapshot(bucket: R2Bucket, id: string, snapshot: ShareSnapshot): Promise<void> {
  await Promise.all([
    bucket.put(keys.html(id), snapshot.html, { httpMetadata: { contentType: "text/html" } }),
    bucket.put(keys.source(id), snapshot.source, { httpMetadata: { contentType: "text/markdown" } }),
    snapshot.comments === undefined
      ? bucket.delete(keys.comments(id))
      : bucket.put(keys.comments(id), snapshot.comments, { httpMetadata: { contentType: "text/markdown" } }),
  ]);
}

export async function readComments(bucket: R2Bucket, id: string): Promise<string | undefined> {
  return readText(bucket, keys.comments(id));
}

export async function writeComments(bucket: R2Bucket, id: string, content: string | undefined): Promise<void> {
  if (content === undefined) {
    await bucket.delete(keys.comments(id));
    return;
  }
  await bucket.put(keys.comments(id), content, { httpMetadata: { contentType: "text/markdown" } });
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
```

**Step 2: Create `worker/src/auth.ts`**

```ts
import type { Env } from "./env";
import { base64url, type PasswordRecord, type ShareMeta } from "./store";

const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(text));
}

async function equalSecrets(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

export async function isPublisher(request: Request, env: Env): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  return equalSecrets(header.slice("Bearer ".length), env.PUBLISH_TOKEN);
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = base64url(saltBytes);
  const hash = await derive(password, saltBytes, PBKDF2_ITERATIONS);
  return { salt, hash, iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  const saltBytes = Uint8Array.from(atob(record.salt.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
    c.charCodeAt(0),
  );
  const hash = await derive(password, saltBytes, record.iterations);
  return equalSecrets(hash, record.hash);
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return base64url(new Uint8Array(bits));
}

export function unlockCookieName(id: string): string {
  return `readit_unlock_${id}`;
}

export async function unlockCookieValue(env: Env, meta: ShareMeta): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.COOKIE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`${meta.id}:${meta.password?.salt ?? ""}`));
  return base64url(new Uint8Array(sig));
}

export function unlockCookieHeader(id: string, value: string): string {
  return `${unlockCookieName(id)}=${value}; Path=/s/${id}; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_S}`;
}

export async function hasValidUnlock(request: Request, env: Env, meta: ShareMeta): Promise<boolean> {
  const cookies = request.headers.get("cookie") ?? "";
  const name = unlockCookieName(meta.id);
  const found = cookies
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!found) return false;
  const expected = await unlockCookieValue(env, meta);
  return equalSecrets(found.slice(name.length + 1), expected);
}
```

**Step 3: Verify**

Run: `bun run typecheck:worker`
Expected: No errors

**Step 4: Commit**

```bash
git add worker/src/store.ts worker/src/auth.ts
git commit -m "feat(worker): share store and auth primitives"
```

---

### Task 5: Publisher API

**Files:**
- Create: `worker/src/publish.ts`

**Step 1: Create `worker/src/publish.ts`**

```ts
import { hashPassword, isPublisher } from "./auth";
import type { Env } from "./env";
import { errorResponse, errorWithDetail, json } from "./http";
import {
  assetKey,
  deleteShare,
  isShareMode,
  listShares,
  newShareId,
  readComments,
  readMeta,
  type ShareMeta,
  ShareModes,
  writeMeta,
  writeSnapshot,
} from "./store";

const ASSET_NAME = /^[a-f0-9]{16}\.[a-z0-9]{1,5}$/;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export async function handlePublish(request: Request, env: Env, url: URL): Promise<Response> {
  if (!(await isPublisher(request, env))) {
    return errorResponse("Unauthorized", 401);
  }

  const parts = url.pathname.split("/").filter(Boolean); // ["api","shares", id?, "assets"?, name?]
  const id = parts[2];
  const method = request.method;

  try {
    if (!id) {
      if (method === "GET") {
        const shares = await listShares(env.SHARES);
        return json({
          shares: shares.map(({ id, fileName, mode, updatedAt }) => ({ id, fileName, mode, updatedAt })),
        });
      }
      if (method === "POST") return createShare(request, env, url);
      return errorResponse("Method not allowed", 405);
    }

    const meta = await readMeta(env.SHARES, id);
    if (!meta) return errorResponse("Share not found", 404);

    if (parts[3] === "assets" && parts[4]) {
      return handleAsset(request, env, id, parts[4]);
    }
    if (parts[3] === "comments" && method === "GET") {
      const content = await readComments(env.SHARES, id);
      return new Response(content ?? "", { headers: { "content-type": "text/markdown; charset=utf-8" } });
    }
    if (parts.length !== 3) return errorResponse("Not found", 404);

    if (method === "PUT") return replaceSnapshot(request, env, meta);
    if (method === "PATCH") return updateAccess(request, env, meta);
    if (method === "DELETE") {
      await deleteShare(env.SHARES, id);
      return json({ success: true });
    }
    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("publish error:", err);
    return errorWithDetail("Publish failed", err);
  }
}

async function createShare(request: Request, env: Env, url: URL): Promise<Response> {
  const body = (await request.json()) as { fileName?: string; mode?: string; password?: string };
  if (!body.fileName) return errorResponse("fileName is required", 400);
  const mode = body.mode ?? ShareModes.LINK;
  if (!isShareMode(mode)) return errorResponse("Invalid mode", 400);
  if (mode === ShareModes.PASSWORD && !body.password) return errorResponse("password is required", 400);

  const now = new Date().toISOString();
  const meta: ShareMeta = {
    id: newShareId(),
    fileName: body.fileName,
    hash: "",
    mode,
    password: mode === ShareModes.PASSWORD ? await hashPassword(body.password!) : undefined,
    headings: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeMeta(env.SHARES, meta);
  return json({ id: meta.id, url: `${url.origin}/s/${meta.id}` }, 201);
}

async function replaceSnapshot(request: Request, env: Env, meta: ShareMeta): Promise<Response> {
  const body = (await request.json()) as {
    fileName?: string;
    hash?: string;
    html?: string;
    source?: string;
    comments?: string;
    headings?: ShareMeta["headings"];
    mode?: string;
    password?: string;
  };
  if (typeof body.html !== "string" || typeof body.source !== "string" || typeof body.hash !== "string") {
    return errorResponse("html, source, and hash are required", 400);
  }
  if (body.mode !== undefined && !isShareMode(body.mode)) return errorResponse("Invalid mode", 400);

  const mode = body.mode ?? meta.mode;
  const password =
    mode !== ShareModes.PASSWORD ? undefined : body.password ? await hashPassword(body.password) : meta.password;
  if (mode === ShareModes.PASSWORD && !password) return errorResponse("password is required", 400);

  await writeSnapshot(env.SHARES, meta.id, {
    html: body.html,
    source: body.source,
    comments: body.comments,
  });
  await writeMeta(env.SHARES, {
    ...meta,
    fileName: body.fileName ?? meta.fileName,
    hash: body.hash,
    headings: body.headings ?? [],
    mode,
    password,
    updatedAt: new Date().toISOString(),
  });
  return json({ success: true });
}

async function updateAccess(request: Request, env: Env, meta: ShareMeta): Promise<Response> {
  const body = (await request.json()) as { mode?: string; password?: string };
  const mode = body.mode ?? meta.mode;
  if (!isShareMode(mode)) return errorResponse("Invalid mode", 400);
  const password =
    mode !== ShareModes.PASSWORD ? undefined : body.password ? await hashPassword(body.password) : meta.password;
  if (mode === ShareModes.PASSWORD && !password) return errorResponse("password is required", 400);

  await writeMeta(env.SHARES, { ...meta, mode, password, updatedAt: new Date().toISOString() });
  return json({ success: true });
}

async function handleAsset(request: Request, env: Env, id: string, name: string): Promise<Response> {
  if (!ASSET_NAME.test(name)) return errorResponse("Invalid asset name", 400);
  const key = assetKey(id, name);

  if (request.method === "HEAD") {
    const head = await env.SHARES.head(key);
    return new Response(null, { status: head ? 200 : 404 });
  }
  if (request.method !== "PUT") return errorResponse("Method not allowed", 405);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_ASSET_BYTES) return errorResponse("Asset too large", 413);

  await env.SHARES.put(key, request.body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" },
  });
  return json({ success: true });
}
```

**Step 2: Verify with curl against `wrangler dev`**

Set a local secret in `worker/.dev.vars` (gitignored by wrangler):

```
PUBLISH_TOKEN=dev-token
COOKIE_SECRET=dev-cookie-secret
```

Run:

```bash
curl -s -X POST localhost:8787/api/shares -H 'authorization: Bearer dev-token' -H 'content-type: application/json' -d '{"fileName":"test.md"}'
```

Expected: `{"id":"<22 chars>","url":"http://localhost:8787/s/<id>"}`

Run: same without the header
Expected: `{"error":"Unauthorized"}` with status 401

**Step 3: Commit**

```bash
git add worker/src/publish.ts
git commit -m "feat(worker): publisher API"
```

---

### Task 6: Viewer page, access control, and unlock

**Files:**
- Create: `worker/src/view.ts`, `worker/src/page.ts`

**Step 1: Create `worker/src/page.ts`**

```ts
import { parseCommentFile } from "../../src/lib/comment-storage";
import { resolveComments } from "../../src/lib/resolve-comments";
import type { InlineData } from "../../src/schema";
import { renderTemplate } from "../../src/template";
import manifest from "./manifest.json";
import type { ShareMeta, ShareSnapshot } from "./store";

const entry = (manifest as Record<string, { file: string; css?: string[] }>)["index.html"];

export function renderSharePage(meta: ShareMeta, snapshot: ShareSnapshot): string {
  const filePath = `/s/${meta.id}/${meta.fileName}`;
  const comments = snapshot.comments
    ? resolveComments({
        comments: parseCommentFile(snapshot.comments).comments,
        source: snapshot.source,
        html: snapshot.html,
      })
    : [];

  const inlineData: InlineData = {
    files: [{ path: filePath, fileName: meta.fileName }],
    activeFile: filePath,
    clean: false,
    workingDirectory: "",
    documents: { [filePath]: { headings: meta.headings, comments } },
    settings: { version: 1, fontFamily: "serif" },
    hosted: true,
    apiBase: `/s/${meta.id}`,
  };

  return renderTemplate({
    title: meta.fileName,
    cssPath: entry.css?.[0] ? `/${entry.css[0]}` : "",
    jsPath: `/${entry.file}`,
    documentHtml: snapshot.html,
    inlineData,
    isDev: false,
    fontFamily: "serif",
  });
}

export function renderUnlockPage(id: string, failed: boolean): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>readit — locked</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fafafa;color:#222}
form{display:grid;gap:.75rem;width:min(20rem,90vw)}input,button{font:inherit;padding:.6rem .8rem;border-radius:.5rem;border:1px solid #bbb}
button{background:#222;color:#fff;border-color:#222;cursor:pointer}.err{color:#b00020;margin:0}</style></head>
<body><form method="post" action="/s/${id}/unlock">
<h1 style="margin:0;font-size:1.1rem">This document is password protected</h1>
${failed ? '<p class="err">Wrong password, try again.</p>' : ""}
<input type="password" name="password" autofocus required autocomplete="current-password" placeholder="Password">
<button type="submit">Open</button></form></body></html>`;
}
```

Check `renderTemplate` in `src/template.ts` matches the option names used here (`title`, `cssPath`, `jsPath`, `documentHtml`, `inlineData`, `isDev`, `fontFamily`) and that `InlineDocData` has no `html` field; adjust the literal if the type differs.

**Step 2: Create `worker/src/view.ts`**

```ts
import { hasValidUnlock, unlockCookieHeader, unlockCookieValue, verifyPassword } from "./auth";
import { handleShareComments } from "./comments";
import type { Env } from "./env";
import { errorResponse, json } from "./http";
import { renderSharePage, renderUnlockPage } from "./page";
import { assetKey, readMeta, readSnapshot, type ShareMeta, ShareModes } from "./store";

const NO_STORE = "no-store";
const PUBLIC_CACHE = "public, max-age=0, s-maxage=60";

export async function handleShare(request: Request, env: Env, url: URL, id: string, rest: string): Promise<Response> {
  const meta = await readMeta(env.SHARES, id);
  if (!meta) return new Response("Not found", { status: 404 });

  if (rest === "/unlock" && request.method === "POST") {
    return unlock(request, env, meta);
  }

  if (meta.mode === ShareModes.PASSWORD && !(await hasValidUnlock(request, env, meta))) {
    if (rest === "" || rest === "/") {
      return html(renderUnlockPage(id, url.searchParams.has("failed")), 401, meta);
    }
    return errorResponse("Locked", 401);
  }

  if (rest === "" || rest === "/") {
    const snapshot = await readSnapshot(env.SHARES, id);
    if (!snapshot) return new Response("Share has no content yet", { status: 404 });
    return html(renderSharePage(meta, snapshot), 200, meta);
  }

  if (rest.startsWith("/assets/")) {
    const obj = await env.SHARES.get(assetKey(id, rest.slice("/assets/".length)));
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, {
      headers: {
        "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  }

  if (rest.startsWith("/api/")) {
    return handleShareComments(request, env, meta, rest.slice("/api".length));
  }

  return new Response("Not found", { status: 404 });
}

async function unlock(request: Request, env: Env, meta: ShareMeta): Promise<Response> {
  if (meta.mode !== ShareModes.PASSWORD || !meta.password) {
    return Response.redirect(new URL(`/s/${meta.id}`, request.url).toString(), 303);
  }
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.UNLOCK_LIMITER.limit({ key: `${meta.id}:${ip}` });
  if (!success) return errorResponse("Too many attempts, wait a minute", 429);

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const ok = password.length > 0 && (await verifyPassword(password, meta.password));
  const target = new URL(`/s/${meta.id}${ok ? "" : "?failed=1"}`, request.url).toString();
  const headers = new Headers({ location: target });
  if (ok) headers.set("set-cookie", unlockCookieHeader(meta.id, await unlockCookieValue(env, meta)));
  return new Response(null, { status: 303, headers });
}

function html(body: string, status: number, meta: ShareMeta): Response {
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": meta.mode === ShareModes.PUBLIC ? PUBLIC_CACHE : NO_STORE,
  };
  if (meta.mode !== ShareModes.PUBLIC) headers["x-robots-tag"] = "noindex";
  return new Response(body, { status, headers });
}

export { json };
```

Create `worker/src/comments.ts` as a stub exporting `handleShareComments` returning 501 until Task 7.

**Step 3: Verify**

Publish a snapshot by hand against `wrangler dev` (use the share id from Task 5):

```bash
curl -s -X PUT localhost:8787/api/shares/<id> -H 'authorization: Bearer dev-token' -H 'content-type: application/json' \
  -d '{"fileName":"test.md","hash":"abc","html":"<h1 id=\"hello\">Hello</h1><p>World</p>","source":"# Hello\n\nWorld\n","headings":[{"id":"hello","text":"Hello","level":1}]}'
```

Open `http://localhost:8787/s/<id>` in a browser.
Expected: the readit UI renders "Hello / World", no disconnect banner, selecting text shows the comment input.

Run: `curl -s -X PATCH ... -d '{"mode":"password","password":"pw"}'` and reload.
Expected: the unlock form; wrong password redirects with the error line; correct password shows the document and sets a `readit_unlock_<id>` cookie scoped to `/s/<id>`.

**Step 4: Commit**

```bash
git add worker/src/view.ts worker/src/page.ts worker/src/comments.ts
git commit -m "feat(worker): viewer page with public, link, and password modes"
```

---

### Task 7: Viewer comments API

Mirror `addComment`, `updateComment`, `deleteComment`, `clearComments`, `getRawComments`, and `reanchorComment` from `src/server.ts:309-505` on top of R2. Same request and response shapes, so the Svelte app is unchanged.

**Files:**
- Modify: `worker/src/comments.ts`

**Step 1: Implement `worker/src/comments.ts`**

```ts
import {
  computeHash,
  createComment,
  getLineHint,
  parseCommentFile,
  serializeComments,
  truncateSelection,
} from "../../src/lib/comment-storage";
import { resolveComments } from "../../src/lib/resolve-comments";
import { AnchorConfidences, type Comment } from "../../src/schema";
import type { Env } from "./env";
import { errorResponse, errorWithDetail, json } from "./http";
import { readComments, readSnapshot, type ShareMeta, writeComments } from "./store";

const COMMENT_ID = /^\/comments\/([A-Za-z0-9-]+)(\/reanchor)?$/;

export async function handleShareComments(request: Request, env: Env, meta: ShareMeta, route: string): Promise<Response> {
  const snapshot = await readSnapshot(env.SHARES, meta.id);
  if (!snapshot) return errorResponse("Share has no content yet", 404);
  const method = request.method;

  try {
    if (route === "/document" && method === "GET") {
      return json({
        html: snapshot.html,
        headings: meta.headings,
        filePath: `/s/${meta.id}/${meta.fileName}`,
        fileName: meta.fileName,
        clean: false,
      });
    }

    const stored = snapshot.comments ? parseCommentFile(snapshot.comments).comments : [];
    const save = (comments: Comment[]) =>
      writeComments(
        env.SHARES,
        meta.id,
        comments.length === 0
          ? undefined
          : serializeComments({
              source: `/s/${meta.id}/${meta.fileName}`,
              hash: computeHash(snapshot.source),
              version: 1,
              comments,
            }),
      );

    if (route === "/comments" && method === "GET") {
      return json({ comments: resolveComments({ comments: stored, source: snapshot.source, html: snapshot.html }) });
    }
    if (route === "/comments/raw" && method === "GET") {
      return json({ content: snapshot.comments ?? null, path: `/s/${meta.id}/comments.md` });
    }
    if (route === "/comments" && method === "POST") {
      const { selectedText, comment, startOffset, endOffset } = await request.json<Record<string, unknown>>();
      if (!selectedText || typeof comment !== "string" || startOffset === undefined || endOffset === undefined) {
        return errorResponse("Missing required fields", 400);
      }
      const created = createComment(
        String(selectedText),
        comment,
        Number(startOffset),
        Number(endOffset),
        snapshot.source,
      );
      await save([...stored, created]);
      return json({ comment: created }, 201);
    }
    if (route === "/comments" && method === "DELETE") {
      await save([]);
      return json({ success: true });
    }

    const match = route.match(COMMENT_ID);
    if (!match) return errorResponse("Not found", 404);
    const [, id, reanchor] = match;
    const index = stored.findIndex((c) => c.id === id);
    if (index === -1) return errorResponse("Comment not found", 404);

    if (reanchor && method === "PUT") {
      const { selectedText, startOffset, endOffset } = await request.json<Record<string, unknown>>();
      if (!selectedText || startOffset === undefined || endOffset === undefined) {
        return errorResponse("Missing required fields", 400);
      }
      const text = String(selectedText);
      const updated: Comment = {
        ...stored[index],
        selectedText: truncateSelection(text),
        startOffset: Number(startOffset),
        endOffset: Number(endOffset),
        lineHint: getLineHint(snapshot.source, Number(startOffset), Number(endOffset)),
        anchorConfidence: AnchorConfidences.EXACT,
        anchorPrefix: text.length > 1000 ? text.slice(0, 200) : undefined,
      };
      await save(stored.map((c, i) => (i === index ? updated : c)));
      return json({ comment: updated });
    }
    if (method === "PUT") {
      const { comment } = await request.json<Record<string, unknown>>();
      if (typeof comment !== "string") return errorResponse("Missing comment text", 400);
      const updated = { ...stored[index], comment: comment.trim() };
      await save(stored.map((c, i) => (i === index ? updated : c)));
      return json({ comment: updated });
    }
    if (method === "DELETE") {
      await save(stored.filter((c) => c.id !== id));
      return json({ success: true });
    }
    return errorResponse("Method not allowed", 405);
  } catch (err) {
    console.error("share comments error:", err);
    return errorWithDetail("Comment operation failed", err);
  }
}
```

**Step 2: Verify in the browser against `wrangler dev`**

1. Open the share, select text, add a comment.
   Expected: margin note appears, reload keeps it.
2. Edit and delete the comment.
   Expected: both persist across reload.
3. `curl -H 'authorization: Bearer dev-token' localhost:8787/api/shares/<id>/comments`
   Expected: a `.comments.md` document whose `source:` is `/s/<id>/test.md`.

**Step 3: Commit**

```bash
git add worker/src/comments.ts
git commit -m "feat(worker): viewer comments API on R2"
```

---

### Task 8: CLI remote configuration

**Files:**
- Create: `src/remote.ts`
- Modify: `src/cli.ts`

**Step 1: Create `src/remote.ts`**

```ts
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { join } from "node:path";
import * as readline from "node:readline/promises";

const CONFIG_PATH = join(os.homedir(), ".readit", "config.json");
const SHARES_PATH = join(os.homedir(), ".readit", "shares.json");

export interface RemoteConfig {
  url: string;
  token: string;
}

export interface ShareRecord {
  id: string;
  url: string;
  mode: string;
  publishedIds: string[];
}

export async function loadRemote(): Promise<RemoteConfig> {
  const envUrl = process.env.READIT_REMOTE_URL;
  const envToken = process.env.READIT_TOKEN;
  if (envUrl && envToken) return { url: envUrl.replace(/\/$/, ""), token: envToken };

  try {
    const raw = JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8")) as { remote?: RemoteConfig };
    if (raw.remote?.url && raw.remote?.token) {
      return { url: raw.remote.url.replace(/\/$/, ""), token: raw.remote.token };
    }
  } catch {}
  throw new Error("No remote configured. Run `readit remote setup` or set READIT_REMOTE_URL and READIT_TOKEN.");
}

export async function saveRemote(remote: RemoteConfig): Promise<void> {
  await fs.mkdir(join(os.homedir(), ".readit"), { recursive: true });
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fs.readFile(CONFIG_PATH, "utf-8"));
  } catch {}
  await fs.writeFile(CONFIG_PATH, JSON.stringify({ ...existing, remote }, null, 2), { mode: 0o600 });
}

export async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function loadShares(): Promise<Record<string, ShareRecord>> {
  try {
    return JSON.parse(await fs.readFile(SHARES_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export async function saveShares(shares: Record<string, ShareRecord>): Promise<void> {
  await fs.mkdir(join(os.homedir(), ".readit"), { recursive: true });
  await fs.writeFile(SHARES_PATH, JSON.stringify(shares, null, 2));
}

export async function remoteFetch(remote: RemoteConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${remote.token}`);
  const res = await fetch(`${remote.url}${path}`, { ...init, headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} failed (${res.status}): ${detail}`);
  }
  return res;
}
```

**Step 2: Add the `remote` command to `src/cli.ts`**

After the existing `show` command:

```ts
const remote = program.command("remote").description("Configure and inspect the share remote");

remote
  .command("setup")
  .description("Store the Worker URL and publish token in ~/.readit/config.json")
  .action(async () => {
    const url = await prompt("Worker URL (e.g. https://readit-share.example.workers.dev): ");
    const token = await prompt("Publish token: ");
    if (!url || !token) {
      console.error("Both URL and token are required.");
      process.exit(1);
    }
    await saveRemote({ url, token });
    const health = await fetch(`${url.replace(/\/$/, "")}/api/health`).then((r) => r.ok).catch(() => false);
    console.log(health ? "Saved. Remote is reachable." : "Saved, but the remote did not answer /api/health.");
  });

remote
  .command("list")
  .description("List shares on the remote")
  .action(async () => {
    const config = await loadRemote();
    const { shares } = (await (await remoteFetch(config, "/api/shares")).json()) as {
      shares: { id: string; fileName: string; mode: string; updatedAt: string }[];
    };
    if (shares.length === 0) {
      console.log("No shares.");
      return;
    }
    for (const s of shares) {
      console.log(`${s.mode.padEnd(8)} ${config.url}/s/${s.id}  ${s.fileName}  (${s.updatedAt})`);
    }
  });
```

**Step 3: Verify**

Run: `bun dev remote setup` with the `wrangler dev` URL and `dev-token`
Expected: "Saved. Remote is reachable." and `~/.readit/config.json` has mode 600

Run: `bun dev remote list`
Expected: the share created in Task 5

**Step 4: Commit**

```bash
git add src/remote.ts src/cli.ts
git commit -m "feat(cli): readit remote setup and list"
```

---

### Task 9: `readit share` and `readit unshare`

**Files:**
- Create: `src/share.ts`
- Modify: `src/cli.ts`

**Step 1: Create `src/share.ts`**

```ts
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { computeHash, getCommentPath, parseCommentFile, serializeComments } from "./lib/comment-storage";
import { renderMarkdown } from "./lib/markdown-renderer";
import {
  loadRemote,
  loadShares,
  type RemoteConfig,
  remoteFetch,
  saveShares,
  type ShareRecord,
} from "./remote";
import { sanitizeHtml } from "./template";

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

export interface ShareOptions {
  mode: "public" | "link" | "password";
  password?: string;
}

export async function shareFile(file: string, options: ShareOptions): Promise<ShareRecord> {
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
      body: JSON.stringify({ fileName, mode: options.mode, password: options.password }),
    });
    const created = (await res.json()) as { id: string; url: string };
    record = { id: created.id, url: created.url, mode: options.mode, publishedIds: [] };
  }

  const { html: rendered, headings } = await renderMarkdown(source);
  const html = await uploadImages(remote, record.id, dirname(absPath), sanitizeHtml(rendered));
  const comments = await readLocalComments(absPath, record.id, fileName, source);

  await remoteFetch(remote, `/api/shares/${record.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName,
      hash: computeHash(source),
      html,
      source,
      comments: comments?.text,
      headings,
      mode: options.mode,
      password: options.password,
    }),
  });

  record = { ...record, mode: options.mode, publishedIds: comments?.ids ?? [] };
  shares[absPath] = record;
  await saveShares(shares);
  return record;
}

export async function unshareFile(file: string): Promise<ShareRecord | undefined> {
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
  const text = serializeComments({
    source: `/s/${shareId}/${fileName}`,
    hash: computeHash(source),
    version: 1,
    comments: file.comments,
  });
  return { text, ids: file.comments.map((c) => c.id) };
}

async function uploadImages(remote: RemoteConfig, shareId: string, baseDir: string, html: string): Promise<string> {
  const replacements = new Map<string, string>();

  for (const match of html.matchAll(IMG_SRC)) {
    const src = match[1];
    if (replacements.has(src) || /^(https?:|data:|\/)/i.test(src)) continue;

    const localPath = resolve(baseDir, decodeURIComponent(src.split("?")[0]));
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(localPath);
    } catch {
      console.warn(`warning: image not found, left as-is: ${src}`);
      continue;
    }

    const ext = extname(localPath).slice(1).toLowerCase();
    const name = `${crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.${ext}`;
    const assetPath = `/api/shares/${shareId}/assets/${name}`;

    const exists = await remoteFetch(remote, assetPath, { method: "HEAD" }).then(() => true, () => false);
    if (!exists) {
      await remoteFetch(remote, assetPath, {
        method: "PUT",
        headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
        body: bytes,
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
```

`sanitizeHtml` in `src/template.ts` is not exported today; export it. `remoteFetch` throws on 404 for `HEAD`, which the `.then(() => true, () => false)` turns into "not present".

**Step 2: Add the commands to `src/cli.ts`**

```ts
program
  .command("share <file>")
  .description("Publish a Markdown file to the configured share remote")
  .option("--public", "Anyone can view")
  .option("--password [password]", "Require a password (prompted when omitted)")
  .action(async (file: string, opts: { public?: boolean; password?: string | boolean }) => {
    let mode: "public" | "link" | "password" = "link";
    let password: string | undefined;
    if (opts.public) mode = "public";
    if (opts.password !== undefined) {
      mode = "password";
      password = typeof opts.password === "string" ? opts.password : await prompt("Password: ");
      if (!password) {
        console.error("Password cannot be empty.");
        process.exit(1);
      }
    }
    const record = await shareFile(file, { mode, password });
    console.log(`${mode}: ${record.url}`);
  });

program
  .command("unshare <file>")
  .description("Remove a published share")
  .action(async (file: string) => {
    const record = await unshareFile(file);
    console.log(record ? `Removed ${record.url}` : "Not shared.");
  });
```

**Step 3: Verify**

Create `scratch/img-test.md` containing a heading, a paragraph, and `![logo](./logo.png)` next to a real PNG.

Run: `bun dev share scratch/img-test.md`
Expected: prints `link: http://localhost:8787/s/<id>`; the page shows the image; `~/.readit/shares.json` has the mapping

Run: `bun dev share scratch/img-test.md --password hunter2`
Expected: same URL; the page now asks for a password

Run: `bun dev unshare scratch/img-test.md`
Expected: `Removed ...`; the URL now returns 404

**Step 4: Commit**

```bash
git add src/share.ts src/cli.ts src/template.ts
git commit -m "feat(cli): readit share and unshare"
```

---

### Task 10: `readit pull` with comment merge

> **Decision point.** The merge rule decides what happens when a collaborator deletes a comment on the web while the author edits the same comment locally. The design doc picks "remote wins for ids that were published; remote-only ids are appended; a published id missing remotely is a remote deletion." Confirm this with Jay before implementing; the function below is the place to change if the rule changes.

**Files:**
- Create: `src/lib/merge-comments.ts`, `src/lib/merge-comments.test.ts`
- Modify: `src/cli.ts`

**Step 1: Create `src/lib/merge-comments.ts`**

```ts
import type { Comment } from "../schema";

export function mergeComments({
  local,
  remote,
  publishedIds,
}: {
  local: Comment[];
  remote: Comment[];
  publishedIds: string[];
}): Comment[] {
  const published = new Set(publishedIds);
  const remoteById = new Map(remote.map((c) => [c.id, c]));
  const merged: Comment[] = [];

  for (const comment of local) {
    const fromRemote = remoteById.get(comment.id);
    if (fromRemote) {
      merged.push(fromRemote);
      continue;
    }
    if (published.has(comment.id)) {
      continue; // was published, now gone on the remote: deleted on the web
    }
    merged.push(comment); // added locally since the last publish
  }

  const localIds = new Set(local.map((c) => c.id));
  for (const comment of remote) {
    if (!localIds.has(comment.id)) merged.push(comment);
  }

  return merged;
}
```

**Step 2: Create `src/lib/merge-comments.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { Comment } from "../schema";
import { mergeComments } from "./merge-comments";

const c = (id: string, comment = id): Comment => ({
  id,
  comment,
  selectedText: "x",
  startOffset: 0,
  endOffset: 1,
});

describe("mergeComments", () => {
  it("takes the remote version of published comments", () => {
    const merged = mergeComments({ local: [c("a", "old")], remote: [c("a", "new")], publishedIds: ["a"] });
    expect(merged).toEqual([c("a", "new")]);
  });

  it("drops comments that were published and deleted remotely", () => {
    const merged = mergeComments({ local: [c("a")], remote: [], publishedIds: ["a"] });
    expect(merged).toEqual([]);
  });

  it("keeps comments added locally after publish", () => {
    const merged = mergeComments({ local: [c("a")], remote: [], publishedIds: [] });
    expect(merged).toEqual([c("a")]);
  });

  it("appends comments added on the web", () => {
    const merged = mergeComments({ local: [c("a")], remote: [c("a"), c("b")], publishedIds: ["a"] });
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
```

**Step 3: Add `pull` to `src/cli.ts`**

```ts
program
  .command("pull <file>")
  .description("Merge comments from the share back into the local .comments.md")
  .action(async (file: string) => {
    const remote = await loadRemote();
    const absPath = await fs.realpath(resolve(file));
    const shares = await loadShares();
    const record = shares[absPath];
    if (!record) {
      console.error("Not shared. Run `readit share` first.");
      process.exit(1);
    }

    const remoteText = await (await remoteFetch(remote, `/api/shares/${record.id}/comments`)).text();
    const remoteComments = remoteText ? parseCommentFile(remoteText).comments : [];

    const commentPath = getCommentPath(absPath);
    let localComments: Comment[] = [];
    try {
      localComments = parseCommentFile(await fs.readFile(commentPath, "utf-8")).comments;
    } catch {}

    const merged = mergeComments({ local: localComments, remote: remoteComments, publishedIds: record.publishedIds });
    const source = await fs.readFile(absPath, "utf-8");

    await fs.mkdir(dirname(commentPath), { recursive: true });
    await fs.writeFile(
      commentPath,
      serializeComments({ source: absPath, hash: computeHash(source), version: 1, comments: merged }),
    );

    shares[absPath] = { ...record, publishedIds: merged.map((c) => c.id) };
    await saveShares(shares);

    const added = remoteComments.filter((r) => !localComments.some((l) => l.id === r.id)).length;
    console.log(`Merged ${merged.length} comments (${added} new from the web).`);
  });
```

**Step 4: Verify**

Run: `bun run test`
Expected: the four merge tests pass

Run: share a file, add a comment in the browser, then `bun dev pull <file>`, then `bun dev show <file>`
Expected: the web comment appears locally with the same id

**Step 5: Commit**

```bash
git add src/lib/merge-comments.ts src/lib/merge-comments.test.ts src/cli.ts
git commit -m "feat(cli): readit pull merges web comments"
```

---

### Task 11: Deploy and document

**Files:**
- Create: `worker/README.md`
- Modify: `README.md`, `.claude/CLAUDE.md`, `.claude/roadmap.md`, `.claude/user-stories.md`, `Makefile`

**Step 1: `worker/README.md`**

Document the one-time setup:

```bash
wrangler login
wrangler r2 bucket create readit-shares
cd worker
wrangler secret put PUBLISH_TOKEN     # e.g. openssl rand -base64 32
wrangler secret put COOKIE_SECRET     # e.g. openssl rand -base64 32
cd .. && bun run worker:deploy
readit remote setup
```

Plus the share modes, the `readit share` / `unshare` / `pull` commands, and the rotation procedure (re-run `wrangler secret put`).

**Step 2: README section "Sharing"** with the same commands and a one-paragraph description of the three modes.

**Step 3: Update `.claude/CLAUDE.md`**: add `worker/` to the architecture tree, add `share`, `unshare`, `pull`, `remote` to Quick Reference, add "Sharing: snapshot publish to a self-hosted Cloudflare Worker; comments merged back with `readit pull`" to Key Design Decisions.

**Step 4: Update `.claude/roadmap.md`**: add a `v0.8.0 - Sharing & Publishing` section listing the shipped items, and move "Collaborative mode (WebSocket sync)" note to say link sharing is done and real-time sync remains future.

**Step 5: Update `.claude/user-stories.md` US-011**: status "Partially implemented (v0.8.0): shareable link, web comments, merge back. Real-time sync and author attribution are not implemented."

**Step 6: Makefile**: add `deploy-worker: bun run worker:deploy`.

**Step 7: Commit**

```bash
git add worker/README.md README.md .claude Makefile
git commit -m "docs: sharing setup, roadmap v0.8.0, US-011 status"
```

---

### Task 12: End-to-end verification against the deployed Worker

1. Run: `bun run worker:deploy`
   Expected: wrangler prints the `workers.dev` URL; `curl <url>/api/health` returns `{"status":"ok"}`
2. Run: `readit remote setup` with that URL and the real token
   Expected: "Saved. Remote is reachable."
3. Run: `readit share docs/design.md`
   Expected: a `link` URL; opening it on a phone shows the document with existing margin notes
4. On the phone, add a comment. Run: `readit pull docs/design.md && readit show docs/design.md`
   Expected: the phone comment is listed
5. Run: `readit share docs/design.md --password`
   Expected: prompt, then the same URL asks for the password; six wrong attempts within a minute return 429
6. Run: `readit share docs/design.md --public`
   Expected: the page opens without a cookie and the response carries `cache-control: public, max-age=0, s-maxage=60`
7. Run: `readit unshare docs/design.md`
   Expected: the URL returns 404 and `readit remote list` no longer lists it
8. Run: `bun run typecheck && bun run typecheck:worker && bun run check && bun run test && bun run test:e2e`
   Expected: all green; local mode is unchanged

---

## Implementation notes (2026-09-02)

Deviations from the plan as written, made while implementing:

- **`readit share` merges before pushing.** Re-sharing replaces the remote `comments.md`, which would have discarded web comments unless the author ran `readit pull` first. `shareFile` now calls the same `pullComments` the `pull` command uses whenever the share already exists. Task 10's merge rule is unchanged.
- **Prompts buffer stdin lines.** `readline.question` drops lines that arrive before the question is registered (piped input delivers them all at once), so `ask()` collects `line` events instead. `readit remote setup` works interactively and from a pipe.
- **Worker resolves stored comments before mutating** so `PUT /comments/{id}` responses carry offsets, matching the local server.
- **Task checkboxes** are made inert by omitting `onTaskToggle` in hosted mode; `DocumentViewer` marks them `aria-disabled` when no handler is passed, instead of keying on `app.hosted`.
- **Uploads use `Bun.file()`** as the request body; the CLI is Bun-only and `Buffer` is not a `BodyInit` under TypeScript 5.9.
- **CI/CD added** (not in the original task list): `.github/workflows/ci.yml`, `deploy-worker.yml`, `release.yml`. See `worker/README.md` for the secrets each needs.
- **Task 12 is pending** Cloudflare account setup (login, bucket, secrets, GitHub repository secrets), which the author does.
