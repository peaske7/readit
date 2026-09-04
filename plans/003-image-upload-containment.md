# Plan 003: Contain relative image uploads to the document directory and pin asset types and sizes on the Worker

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/share.ts src/lib/share-snapshot.ts src/lib/share-snapshot.test.ts worker/src/publish.ts worker/src/view.ts worker/test/publish.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001
- **Category**: security
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/26

## Why this matters

`readit share` scans the rendered HTML for `<img src="…">`, reads each relative path from disk, and uploads the bytes to the Worker as a public asset. There is no check that the resolved path stays under the document's directory. The shared asset-name rule accepts any 1–5 character lowercase alphanumeric extension, so `.pem`, `.yaml`, `.json`, `.txt` all pass, and the Worker prefers the client-sent `content-type` header over the extension-derived one and checks size only against the client-supplied `Content-Length`. Publishing a Markdown file written by someone else can therefore copy arbitrary readable files from the publisher's machine to a permanently cached public URL. The design doc (`docs/plans/2026-09-02-share-design.md` §5.6) already specifies "10 MB per image, 50 MB per share, unresolved paths are left as-is with a warning"; only the 10 MB Worker check exists, and it is bypassable.

## Current state

- `src/lib/share-snapshot.ts` — the share format shared by CLI and Worker ("Runs in Bun and in workerd, so nothing here may touch `node:` APIs"):
```ts
// src/lib/share-snapshot.ts:69-70
export const ASSET_NAME = /^[a-f0-9]{16}\.[a-z0-9]{1,5}$/;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;
// :72-80  ASSET_MIME = { png, jpg, jpeg, gif, svg, webp, avif }
// :82-92  assetName(bytes, extension) → `${sha256hex16}.${ext}`
// :94-96  isAssetName(name) → ASSET_NAME.test(name)
// :98-102 assetContentType(name) → ASSET_MIME[ext] ?? "application/octet-stream"
```
Tests: `src/lib/share-snapshot.test.ts` (132 lines) — use as the pattern.
- `src/share.ts` `uploadImages` (lines ~246-296):
```ts
    const localPath = resolve(baseDir, decodeURIComponent(src.split("?")[0]));
    let bytes: Uint8Array;
    try { bytes = await fs.readFile(localPath); } catch { console.warn(`warning: image not found, left as-is: ${src}`); continue; }
    const name = await assetName(bytes, extname(localPath).slice(1));
    if (!isAssetName(name)) { console.warn(`warning: unsupported image extension, left as-is: ${src}`); continue; }
    …
      await remoteFetch(remote, assetPath, { method: "PUT", headers: { "content-type": assetContentType(name) }, body: new Uint8Array(bytes) });
```
No containment check, no size check.
- `worker/src/publish.ts` `handleAsset` (lines ~206-233):
```ts
  if (!isAssetName(name)) return errorResponse("Invalid asset name", 400);
  …
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_ASSET_BYTES) return errorResponse("Asset too large", 413);
  await env.SHARES.put(key, request.body, {
    httpMetadata: { contentType: request.headers.get("content-type") ?? assetContentType(name) },
  });
```
- `worker/src/view.ts:61-74` serves assets with the stored content type and `cache-control: private, max-age=31536000, immutable`; no `x-content-type-options`.
- Worker tests exist: `worker/test/publish.test.ts` has "uploads a content-addressed asset and reports whether it exists" (line 124) and "rejects asset names that are not sha256 prefixes" (line 153); helpers in `worker/test/helpers.ts` (`fetchWorker`, `PUBLISHER`, `createShare`). Run with `bun run test:worker`.

Conventions: per-image problems are `console.warn` and `continue`; Worker errors use `errorResponse(message, status)`; conventional commits.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Worker typecheck | `bun run build:worker && bun run typecheck:worker` | exit 0 |
| Unit tests | `bun run test -- share-snapshot asset-path` | all pass |
| Worker tests | `bun run test:worker` | all pass |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:
- `src/lib/share-snapshot.ts` (tighten `ASSET_NAME` to the `ASSET_MIME` keys; add `MAX_SHARE_ASSET_BYTES = 50 MB`)
- `src/lib/share-snapshot.test.ts`
- `src/lib/asset-path.ts` (create; Node-only containment helper) + `src/lib/asset-path.test.ts`
- `src/share.ts` (`uploadImages`)
- `worker/src/publish.ts` (`handleAsset`), `worker/src/view.ts` (asset headers)
- `worker/test/publish.test.ts`

**Out of scope**:
- Global CSP/frame headers (plan 006).
- Viewer comment API limits (plan 005).
- The HTML sanitizer (plan 006).

## Git workflow

- Branch: `advisor/003-image-upload-containment`
- Commits: `fix(share): only upload images under the document directory`, `fix(worker): pin asset content types and enforce upload size`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Tighten the shared asset-name rule

In `src/lib/share-snapshot.ts` replace `ASSET_NAME` with a regex built from the MIME map so the two cannot drift:
```ts
const ASSET_EXTENSIONS = Object.keys(ASSET_MIME);            // move ASSET_MIME above this line
export const ASSET_NAME = new RegExp(`^[a-f0-9]{16}\\.(${ASSET_EXTENSIONS.join("|")})$`);
export const MAX_SHARE_ASSET_BYTES = 50 * 1024 * 1024;
```
`assetContentType` can then drop its `?? "application/octet-stream"` fallback (keep the signature).

Add to `src/lib/share-snapshot.test.ts`: `isAssetName("0123456789abcdef.png")` → true; `.svg` → true; `.pem`, `.json`, `.txt`, `.html` → false; uppercase `.PNG` → false (names are lowercased by `assetName`).

**Verify**: `bun run test -- share-snapshot` → all pass. Existing Worker test "rejects asset names that are not sha256 prefixes" still passes (`bun run test:worker`).

### Step 2: Containment helper (Node side) and its tests

Create `src/lib/asset-path.ts`:
```ts
import { isAbsolute, relative, resolve } from "node:path";

/** Absolute path of `src` if it resolves inside `baseDir`, else undefined. */
export function resolveContainedPath(baseDir: string, src: string): string | undefined {
  const target = resolve(baseDir, src);
  const rel = relative(baseDir, target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return undefined;
  return target;
}
```
`src/lib/asset-path.test.ts` (model on `src/lib/merge-comments.test.ts`): `./img.png` inside; `sub/img.png` inside; `../secret.pem` → undefined; `/etc/hosts` → undefined; `a/../../x` → undefined; `""` → undefined.

**Verify**: `bun run test -- asset-path` → 6 pass.

### Step 3: Use it in `uploadImages`, add realpath and size checks

In `src/share.ts`:
1. Before the loop: `const realBase = await fs.realpath(baseDir); let totalBytes = 0;`
2. Replace the `resolve(baseDir, …)` line with `resolveContainedPath(baseDir, decodeURIComponent(src.split("?")[0]))`; on `undefined` → `console.warn(\`warning: image outside the document directory, left as-is: ${src}\`); continue;`
3. After `readFile` succeeds: `const real = await fs.realpath(localPath); if (real !== realBase && !real.startsWith(realBase + sep)) { warn "image resolves outside the document directory"; continue; }` (import `sep` from `node:path`).
4. Size: `if (bytes.byteLength > MAX_ASSET_BYTES) { warn "image larger than 10 MB, left as-is"; continue; } totalBytes += bytes.byteLength; if (totalBytes > MAX_SHARE_ASSET_BYTES) { console.warn("warning: share exceeds 50 MB of images; remaining images left as-is"); break; }`

**Verify**: `bun run typecheck && bun run check` → exit 0.

### Step 4: Worker: derive the type from the name and enforce the size on real bytes

In `worker/src/publish.ts` `handleAsset`:
- Require `content-length`: if missing or not a non-negative integer → `errorResponse("content-length is required", 411)`; if `> MAX_ASSET_BYTES` → 413 (keep).
- Read the body: `const bytes = new Uint8Array(await request.arrayBuffer()); if (bytes.byteLength > MAX_ASSET_BYTES) return errorResponse("Asset too large", 413);`
- `httpMetadata: { contentType: assetContentType(name) }` — ignore the request header.

In `worker/src/view.ts` asset branch add `"x-content-type-options": "nosniff"`, and when the content type is `image/svg+xml` add `"content-disposition": "attachment"` (an `<img src>` still renders; direct navigation downloads instead of executing scripts).

Add to `worker/test/publish.test.ts` (use `PUBLISHER`, `createShare`, `fetchWorker`): upload with `content-type: text/html` and a `.png` name → stored type on `GET /s/{id}/assets/{name}` is `image/png`; upload with no `content-length` header (pass a `ReadableStream` body so the runtime does not add one; if the test runtime always sets it, assert the 413 path with an oversized body instead and note it) → 411; `GET` of an uploaded `.svg` carries `content-disposition: attachment` and `x-content-type-options: nosniff`.

**Verify**: `bun run build:worker && bun run typecheck:worker` → exit 0; `bun run test:worker` → all pass including the three new cases.

## Test plan

- `share-snapshot.test.ts`: 7 `isAssetName` cases (Step 1).
- `asset-path.test.ts`: 6 cases (Step 2).
- `worker/test/publish.test.ts`: 3 cases (Step 4).
- `src/share.ts` containment is exercised by plan 009's share tests; note in your report that plan 009 should include "an image at `../outside.png` is left untouched".

## Done criteria

- [ ] `bun run test`, `bun run test:worker`, `bun run typecheck`, `bun run typecheck:worker`, `bun run check` exit 0
- [ ] `grep -n "resolve(baseDir" src/share.ts` → no matches; `grep -n "resolveContainedPath" src/share.ts` → one match
- [ ] `grep -n 'headers.get("content-type")' worker/src/publish.ts` → no matches
- [ ] `grep -n "nosniff" worker/src/view.ts` → one match
- [ ] `grep -n "a-z0-9]{1,5}" src/lib/share-snapshot.ts` → no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `uploadImages` has been restructured so the excerpt no longer matches.
- `request.arrayBuffer()` fails typechecking against the pinned `@cloudflare/workers-types` (report; do not cast).

## Maintenance notes

- A shared `assets/` sibling directory (`../assets/x.png`) is intentionally not supported; if needed later, add an explicit extra-root allowlist to `resolveContainedPath` rather than loosening the check.
- Reviewers: the extension allowlist now has one source (`ASSET_MIME`); confirm no second list reappeared.
