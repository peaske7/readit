# Plan 009: Record a share before uploading, write `shares.json` atomically, and test the share/pull failure paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/share.ts src/remote.ts src/lib/readit-home.ts src/lib/merge-comments.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 001 (003 recommended first; it edits `uploadImages` in the same file)
- **Category**: bug / tests
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/31

## Why this matters

`readit share` creates the remote share (`POST /api/shares`), then merges remote comments, renders, uploads images, `PUT`s the snapshot, and only then saves the id into `~/.readit/shares.json`. If the snapshot `PUT` fails (network blip, 413 from the Worker), the Worker holds an orphan `meta.json` and the next `readit share` mints a **new id**, changing a URL the user may already have sent out. `saveShares` writes with a bare `fs.writeFile` while every other durable write in the repo uses temp-file plus rename (`writeAtomic` in `src/lib/readit-home.ts`), and `loadShares` swallows parse errors and returns `{}`, so a torn file silently makes *every* share look unpublished. `unshareFile` cannot remove the local record if the remote already returned 404. Neither `share.ts` nor `remote.ts` has a test. (The stale-registry overwrite that existed before `6ba758c` was fixed by the refactor: the registry is now read once and written once per publish.)

## Current state

- `src/share.ts` `shareFile` (lines ~47-100):
```ts
  const shares = await loadShares();
  const existing = shares[absPath];
  const record = existing
    ? (await mergeRemoteComments(remote, absPath, existing)).record
    : await createShare(remote, fileName, options);      // POST /api/shares → { id, url, mode, publishedIds: [] } — NOT persisted yet
  const rendered = await renderMarkdown(source);
  const html = await uploadImages(remote, record.id, dirname(absPath), sanitizeHtml(rendered.html));
  const comments = await readLocalComments(absPath, record.id, fileName, source);
  await remoteFetch(remote, shareApiPath(record.id), { method: "PUT", … });   // throws on non-2xx
  const published: ShareRecord = { ...record, mode: options.mode, publishedIds: comments?.ids ?? [] };
  shares[absPath] = published;
  await saveShares(shares);                                // first and only registry write
```
- `unshareFile` (~126-137): `remoteFetch(DELETE)` then `delete shares[absPath]; saveShares`.
- `pullComments` (~152-163): `mergeRemoteComments` then `loadShares` / `saveShares`.
- `src/remote.ts`:
```ts
export async function loadShares(): Promise<Record<string, ShareRecord>> {
  try { return JSON.parse(await fs.readFile(sharesPath(), "utf-8")); } catch { return {}; }
}
export async function saveShares(shares): Promise<void> {
  await ensureHome();
  await fs.writeFile(sharesPath(), JSON.stringify(shares, null, 2));
}
```
`remoteFetch` throws `new Error(\`${method} ${path} failed (${status}): ${detail}\`)` on non-2xx. `loadRemote` honors `READIT_REMOTE_URL` + `READIT_TOKEN`.
- `src/lib/readit-home.ts`: `sharesPath()`, `ensureHome()`, `readitHome()` honoring `READIT_HOME`; a private `writeAtomic(filePath, content)` (lines 68-73) — export it.
- Test isolation pattern: `src/lib/readit-home.test.ts` sets `process.env.READIT_HOME` to a `mkdtemp` dir in `beforeEach` and restores it in `afterEach`. Fetch stubbing: `vi.stubGlobal("fetch", vi.fn(...))` (see `src/lib/client.test.ts` for the current pattern).
- Design doc §5.5: `~/.readit/shares.json` maps absolute local path to `{ id, url, mode, publishedIds }`.

Conventions: style guide §3.3.1 early returns; §4.1 one try/catch per operation group.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bun run test -- share remote` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**:
- `src/lib/readit-home.ts` (export `writeAtomic`)
- `src/remote.ts` (`loadShares`, `saveShares`, new `updateShares`)
- `src/share.ts` (`shareFile`, `unshareFile`, `pullComments`)
- `src/share.test.ts` (create), `src/remote.test.ts` (create)

**Out of scope**:
- `mergeComments` semantics (documented decision).
- `uploadImages` internals (plan 003).
- Worker-side orphan cleanup.

## Git workflow

- Branch: `advisor/009-share-record-durability`
- Commits: `fix(share): persist the share id before uploading and write shares.json atomically`, `test(share): cover publish, pull, and unshare failure paths`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Registry helpers

- `src/lib/readit-home.ts`: `export` the existing `writeAtomic`.
- `src/remote.ts`: `saveShares` uses `writeAtomic(sharesPath(), JSON.stringify(shares, null, 2))`. `loadShares`: on `ENOENT` return `{}`; on any other error throw `new Error(\`${sharesPath()} is not valid JSON; fix or delete it (${message})\`)`. Add:
```ts
export async function updateShares(mutate: (shares: Record<string, ShareRecord>) => void): Promise<Record<string, ShareRecord>> {
  const shares = await loadShares(); mutate(shares); await saveShares(shares); return shares;
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Persist the id right after create

In `shareFile`: after `createShare(...)` returns, `await updateShares((s) => { s[absPath] = record; });` (a record with `publishedIds: []` is truthful: nothing published yet; the next run reuses the id). Replace the final `shares[absPath] = published; await saveShares(shares);` with `await updateShares((s) => { s[absPath] = published; });` and drop the early `loadShares` variable if it becomes unused (keep reading `existing` from `loadShares()`). In `pullComments`, replace the load/save pair with `updateShares`.

**Verify**: `bun run typecheck && bun run check` → exit 0.

### Step 3: `unshareFile` tolerates an already-deleted remote

Wrap the `DELETE`: if `remoteFetch` throws and the message includes `(404)`, print `note: share was already gone on the remote` and still remove the local record; other errors propagate and leave the record.

**Verify**: `bun run typecheck` → exit 0.

### Step 4: Tests

`src/remote.test.ts` (isolate with `READIT_HOME` like `readit-home.test.ts`):
1. `loadShares` on a missing file → `{}`.
2. `loadShares` on `not json` → throws mentioning `shares.json`.
3. `saveShares` leaves no `.tmp` and round-trips.
4. `updateShares` applies and persists the mutation.

`src/share.test.ts` (set `READIT_HOME`, `READIT_REMOTE_URL=https://remote.test`, `READIT_TOKEN=t`; `vi.stubGlobal("fetch", ...)` scripted by URL+method; temp Markdown file):
1. Happy path: `POST` → 201 `{id}`, `PUT` → 200; afterwards `loadShares()[absPath].id === id` and `publishedIds` equal the local comment ids.
2. **Snapshot PUT → 500**: `shareFile` rejects **and** `loadShares()[absPath].id === id`.
3. Re-share reuses the id (no `POST /api/shares` in the fetch mock's calls).
4. `unshareFile` with `DELETE` → 404 resolves and removes the record.
5. `unshareFile` with `DELETE` → 500 rejects and keeps the record.
6. `pullComments` with one new remote comment: local `.comments.md` gains it; `publishedIds` includes it.
7. (if plan 003 landed) an `<img src="../outside.png">` is not read and its `src` is unchanged in the `PUT` body.

**Verify**: `bun run test -- share remote` → ≥ 10 new tests pass.

## Test plan

As Step 4.

## Done criteria

- [ ] `bun run test` exits 0 including `share.test.ts` and `remote.test.ts`
- [ ] `grep -n "fs.writeFile(sharesPath" src/remote.ts` → no matches
- [ ] `grep -c "updateShares" src/share.ts` → ≥ 3
- [ ] Test "snapshot PUT → 500 keeps the id" passes
- [ ] `bun run typecheck`, `bun run check` exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `shareFile` has been restructured beyond the excerpt (plan 003 touches only `uploadImages`).
- `READIT_HOME` is not honored by some path `share.ts` writes (report which).

## Maintenance notes

- Every future mutation of `shares.json` goes through `updateShares`.
- Deferred: `readit remote list` flagging remote ids with no local record.
