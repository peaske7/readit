# Plan 005: Make Worker comment writes safe under concurrency and bound what anonymous viewers can do

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- worker/src/comments.ts worker/src/store.ts worker/src/view.ts worker/src/env.ts worker/wrangler.toml worker/vitest.config.ts worker/test src/lib/share-snapshot.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001
- **Category**: bug / security
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/27

## Why this matters

Every viewer comment mutation on the Worker reads the whole `comments.md` object from R2, changes an in-memory array, and writes the whole object back. Two reviewers commenting within one round trip silently lose one comment. The local Bun server protects the identical operation with a per-file lock (`withCommentLock`, `src/server.ts`); the Worker port dropped it. Separately, the viewer API has no size cap, no count cap, no rate limit, and its bulk `DELETE /s/{id}/api/comments` erases every comment on a share for any caller. The design doc (`docs/plans/2026-09-02-share-design.md` §3 Option C) accepts "last-write-wins" for *concurrent edits of the same comment* and accepts anonymous commenting; it does not accept losing whole comments or anonymous wipe.

## Current state

- `worker/src/comments.ts` — `handleShareComments(request, env, meta, route)`:
  - line ~34 `const snapshot = await readSnapshot(env.SHARES, meta.id);`
  - lines ~52-59 `const stored = resolveComments({ comments: snapshot.comments ? parseCommentFile(snapshot.comments).comments : [], source, html })`; `const save = (comments) => saveComments(env, meta, snapshot, filePath, comments)`.
  - `POST /comments` validates types only, then `await save([...stored, created])`; `DELETE /comments` → `await save([])`; `PUT /comments/{id}`, `DELETE /comments/{id}`, `PUT /comments/{id}/reanchor` map/filter `stored` and `save`.
  - `saveComments` (bottom of file) serializes with `serializeComments({ source: filePath, hash: computeHash(snapshot.source), version: 1, comments })` and calls `writeComments`; an empty list writes `undefined` (object deleted).
  - Types `ShareMeta`, `ShareSnapshot` come from `src/lib/share-snapshot.ts`; `shareFilePath`, `sharePath` too.
- `worker/src/store.ts`:
```ts
async function readText(bucket, key) { const obj = await bucket.get(key); return obj ? obj.text() : undefined; }   // etag discarded
export async function readSnapshot(bucket, id) { const [html, source, comments] = await Promise.all([...]); … return { html, source, comments }; }
export async function writeComments(bucket, id, content) {
  if (content === undefined) { await bucket.delete(keys.comments(id)); return; }
  await bucket.put(keys.comments(id), content, MARKDOWN);
}
```
- `worker/src/env.ts` — `UNLOCK_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> }`.
- `worker/wrangler.toml:22-26` — one `[[ratelimits]]` (`UNLOCK_LIMITER`, `namespace_id = "1001"`, 5/60 s).
- `worker/src/view.ts` `unlock()` — limiter usage pattern: key `${meta.id}:${ip}`, `ip = request.headers.get("cf-connecting-ip") ?? "unknown"`.
- `worker/src/auth.ts` — `isPublisher(request, env)`.
- Tests: `worker/test/helpers.ts` builds `testEnv` with stubs for `ASSETS` and `UNLOCK_LIMITER`; `worker/test/view.test.ts` has `postComment(id, comment)` and a "viewer comments" describe. `worker/vitest.config.ts` declares bindings inline (so a new limiter needs a stub in `helpers.ts`, not a config change). Run: `bun run test:worker`.
- R2 conditional writes: `bucket.put(key, value, { onlyIf: { etagMatches } })` returns `null` when the precondition fails; `R2ObjectBody.etag` is available from `bucket.get`.

Conventions: `errorResponse(message, status)` from `worker/src/http.ts`; style guide: early returns, no classes.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Worker tests | `bun run test:worker` | all pass |
| Worker typecheck | `bun run build:worker && bun run typecheck:worker` | exit 0 |
| Lint | `bun run check` | exit 0 |
| Dry-run deploy | `cd worker && bunx wrangler deploy --dry-run` | exit 0 |

## Scope

**In scope**:
- `worker/src/comments.ts`, `worker/src/store.ts`, `worker/src/env.ts`, `worker/wrangler.toml`
- `worker/test/helpers.ts` (add `COMMENT_LIMITER` stub), `worker/test/comments-safety.test.ts` (create)
- `worker/README.md` (limits paragraph)

**Out of scope**:
- `src/server.ts` (already locks).
- Author attribution / per-viewer identity. Bulk delete is gated behind the **publisher token**.
- Frontend. In hosted mode the "clear all comments" action will now get 401; check how `src/lib/client.ts` surfaces non-2xx and mention in your report whether the hosted UI should hide that action (follow-up).

## Git workflow

- Branch: `advisor/005-worker-comment-write-safety`
- Commits: `test(worker): expected-failure cases for lost updates, limits, and bulk delete`, `fix(worker): compare-and-swap comment writes`, `fix(worker): bound viewer comment bodies, counts, and rate`, `fix(worker): require the publish token to clear all comments`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Write the failing tests first

Create `worker/test/comments-safety.test.ts` importing `fetchWorker, PUBLISHER, publishShare, SOURCE` from `./helpers` and copying the `postComment` helper from `view.test.ts`. Cases, all `it.fails(...)` for now:
1. "two concurrent POSTs both persist": `await Promise.all([postComment(id, "a"), postComment(id, "b")])` then `GET /s/{id}/api/comments` → length 2.
2. "rejects a 100 000-character comment": POST with `comment: "x".repeat(100_000)` → 413.
3. "bulk DELETE requires the publisher token": `DELETE /s/{id}/api/comments` with no auth → 401; with `PUBLISHER` → 200 and empty list.

**Verify**: `bun run test:worker` → green with 3 tests reported as expected failures. If case 1 unexpectedly *passes* (miniflare serialized the writes), change it to fire five concurrent POSTs and expect 5; if it still passes, report — it means the runtime is masking the race and the CAS is still required for production.

### Step 1: Thread the R2 etag through read and write

In `worker/src/store.ts`:
- Add `export async function readCommentsObject(bucket, id): Promise<{ text: string | undefined; etag: string | undefined }>` using `bucket.get` and `obj.etag`.
- Change `writeComments(bucket, id, content, expectedEtag?: string): Promise<boolean>`: delete when `content === undefined` (return true); otherwise `put` with `onlyIf: expectedEtag ? { etagMatches: expectedEtag } : undefined` and return `res !== null`. For a first write (no etag) do `head()` first and treat "exists" as a conflict (return false).

**Verify**: `bun run typecheck:worker` → exit 0; `bun run test:worker` → unchanged.

### Step 2: Retry loop around every mutation

In `worker/src/comments.ts` replace `save` with:
```ts
type Mutation = (current: Comment[]) => Comment[] | { error: string; status: number };

async function mutateComments(env: Env, meta: ShareMeta, snapshot: ShareSnapshot, filePath: string, mutate: Mutation): Promise<Comment[] | Response> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { text, etag } = await readCommentsObject(env.SHARES, meta.id);
    const current = resolveComments({ comments: text ? parseCommentFile(text).comments : [], source: snapshot.source, html: snapshot.html });
    const next = mutate(current);
    if (!Array.isArray(next)) return errorResponse(next.error, next.status);
    const content = next.length === 0 ? undefined : serializeComments({ source: filePath, hash: computeHash(snapshot.source), version: 1, comments: next });
    if (await writeComments(env.SHARES, meta.id, content, etag)) return next;
  }
  return errorResponse("Comments changed concurrently, retry", 409);
}
```
Rewrite each mutating route to pass a mutation (POST → append; PUT → find by id, `{error:"Comment not found",status:404}` if missing; DELETE by id → filter; reanchor → map). Keep `stored` for GET routes only.

**Verify**: flip case 1 to `it(`; `bun run test:worker` → passes.

### Step 3: Bound body size and count

Constants at the top of `comments.ts`: `MAX_COMMENT_CHARS = 10_000`, `MAX_SELECTED_CHARS = 5_000`, `MAX_COMMENTS_PER_SHARE = 500`. Enforce: POST/PUT `comment.length` → 413 "Comment too long"; POST/reanchor `selectedText.length` → 413; inside the POST mutation `current.length >= MAX_COMMENTS_PER_SHARE` → `{error:"Too many comments on this share", status: 413}`.

**Verify**: flip case 2 to `it(`; passes.

### Step 4: Rate-limit viewer writes

- `worker/wrangler.toml`: add `[[ratelimits]] name = "COMMENT_LIMITER" namespace_id = "1002" simple = { limit = 30, period = 60 }` with a comment "Viewer comment writes, keyed by share id + IP."
- `worker/src/env.ts`: add `COMMENT_LIMITER` (same type as `UNLOCK_LIMITER`).
- `worker/test/helpers.ts` `testEnv`: add `COMMENT_LIMITER: { limit: async () => ({ success: true }) }`.
- In `handleShareComments`, before any non-GET route: limiter check keyed `${meta.id}:${ip}` → 429 "Too many comment changes, wait a minute" (mirror `view.ts` `unlock`).

**Verify**: `cd worker && bunx wrangler deploy --dry-run` → exit 0; `bun run test:worker` → green.

### Step 5: Gate bulk delete behind the publisher token

In the `route === "/comments" && method === "DELETE"` branch: `if (!(await isPublisher(request, env))) return errorResponse("Unauthorized", 401);`. Per-id delete stays open to viewers (document this).

**Verify**: flip case 3 to `it(`; `bun run test:worker` → all pass; `grep -c "it.fails(" worker/test/comments-safety.test.ts` → 0.

### Step 6: Document

`worker/README.md` "Comments" section: per-comment 10 000 chars, 500 comments per share, 30 writes/minute/IP, clearing all comments requires the publish token; individual edits/deletes remain open to anyone with the link.

## Test plan

- `worker/test/comments-safety.test.ts`: the three cases plus a direct `writeComments` CAS test using `env.SHARES` from `cloudflare:test`: put, capture etag, put again with a stale etag → returns false.

## Done criteria

- [ ] `bun run test:worker` exits 0; `grep -c "it.fails(" worker/test/*.ts` → 0 in every file
- [ ] `bun run typecheck:worker` exits 0; `bunx wrangler deploy --dry-run` exits 0
- [ ] `grep -n "onlyIf" worker/src/store.ts` → ≥ 1; `grep -n "COMMENT_LIMITER" worker/wrangler.toml worker/src/env.ts worker/src/comments.ts worker/test/helpers.ts` → one match each; `grep -n "isPublisher" worker/src/comments.ts` → 1
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The pinned `@cloudflare/workers-types` does not type `onlyIf.etagMatches` on `R2PutOptions` (report the version; do not cast).
- `worker/src/page.ts` needs behavioral changes (it should only need the unchanged `readSnapshot`).

## Maintenance notes

- Every new mutation route must go through `mutateComments`.
- Reviewers: check that reads still return resolved offsets and that the retry loop re-resolves against the *current* comments each attempt.
- Deferred: hiding "clear all comments" in hosted mode (frontend follow-up).
