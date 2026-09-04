# Plan 008: Stop `.md`, `.markdown`, and `.html` siblings from sharing one comment file

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/lib/comment-storage.ts src/lib/comment-storage.test.ts go/internal/server/storage.go go/internal/server/storage_test.go docs/design.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001
- **Category**: bug
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/30

## Why this matters

`getCommentPath` strips the extension before appending `.comments.md`, so `/proj/README.md`, `/proj/README.markdown`, and `/proj/README.html` all map to `~/.readit/comments/proj/README.comments.md`. readit's stated purpose is reviewing Markdown **and** HTML, so `README.md` next to its exported `README.html` is a normal layout. Because every write rewrites the whole file (`writeCommentsToFile`), opening the second sibling and adding a comment overwrites the first sibling's comments with whatever re-anchored, silently. The Go server derives the same path (`go/internal/server/storage.go` `CommentPath`), so both implementations must change together and existing files must keep loading.

## Current state

- `src/lib/comment-storage.ts:22-33`:
```ts
export function getCommentPath(sourcePath: string): string {
  const absolute = path.resolve(sourcePath);
  const normalized = absolute.replace(/^\//, "").replace(/^[A-Z]:[\\/]/, "");
  const ext = path.extname(normalized);
  const withoutExt = normalized.slice(0, -ext.length || undefined);
  return path.join(commentsDir(), `${withoutExt}.comments.md`);   // commentsDir() from ./readit-home.js honors READIT_HOME
}
```
- `docs/design.md` "Path Resolution Algorithm" documents this exact behavior and its examples table shows `review.html → review.comments.md`. The doc must be updated to the new rule.
- Readers/writers of the path: `src/server.ts` (`readCommentsFromFile`, `writeCommentsToFile`, `deleteCommentFile`, `--clean` unlink at line 696), `src/share.ts:152-160,199`, `src/cli.ts` (`show` at ~line 627, `--clean`), `go/internal/server/storage.go` `CommentPath` + `comments.go:22`.
- Tests: `src/lib/comment-storage.test.ts:20-40` (`getCommentPath` cases; it mocks `node:os` `homedir`, which still works because `readitHome()` falls back to `os.homedir()` — or set `process.env.READIT_HOME` as `src/lib/readit-home.test.ts` does); `go/internal/server/storage_test.go`.
- `.comments.md` front matter records `source: <absolute path>` (`serializeComments`), so a file's original source is recoverable from its contents.

Conventions: tests co-located; Go tests table-driven; conventional commits `fix(storage): …`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bun run test -- comment-storage` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Go tests | `make test` (after plan 001) or the CI sequence | `ok` |
| e2e | `bun run test:e2e` | all pass |

## Scope

**In scope**:
- `src/lib/comment-storage.ts` (`getCommentPath`, new `getLegacyCommentPath`, new `resolveExistingCommentPath`)
- `src/lib/comment-storage.test.ts`
- `src/server.ts`, `src/share.ts`, `src/cli.ts` — only the call sites that *read* a comment file switch to the resolver; writers use the new path
- `go/internal/server/storage.go`, `go/internal/server/storage_test.go`, `go/internal/server/comments.go` (same rule)
- `docs/design.md` (Path Structure section)

**Out of scope**:
- Any change to the `.comments.md` content format.
- Hash-based paths (rejected: makes `~/.readit/comments` unbrowsable, contrary to `docs/design.md` "Hackability" goal #1).

## Git workflow

- Branch: `advisor/008-comment-path-extension`
- Commits: `fix(storage): keep the source extension in comment file names`, `fix(go): match the new comment path rule`, `docs: comment path rule keeps the extension`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: New rule with a legacy fallback (TypeScript)

In `src/lib/comment-storage.ts`:
```ts
/** New rule: keep the full basename. /a/README.md → ~/.readit/comments/a/README.md.comments.md */
export function getCommentPath(sourcePath: string): string {
  const absolute = path.resolve(sourcePath);
  const normalized = absolute.replace(/^\//, "").replace(/^[A-Z]:[\\/]/, "");
  return path.join(commentsDir(), `${normalized}.comments.md`);
}

/** Pre-2026-09 rule (extension stripped). Read-only, for migration. */
export function getLegacyCommentPath(sourcePath: string): string { /* the old body */ }

/**
 * Where to read comments from: the new path if it exists, else the legacy path
 * if it exists AND its front matter `source:` equals this file's absolute path
 * (so a sibling's file is never adopted), else the new path.
 */
export async function resolveExistingCommentPath(sourcePath: string): Promise<string> { … }
```
The `source:` check reuses `parseCommentFile(content).source` and compares with `path.resolve(sourcePath)`.

Update `comment-storage.test.ts`: existing expectations become `…/home/user/doc.md.comments.md`; add: `.md` vs `.html` siblings produce different paths; `resolveExistingCommentPath` picks legacy only when its `source` matches (use `vi.mock("node:fs/promises")` or a temp `HOME` — the file already mocks `node:os`).

**Verify**: `bun run test -- comment-storage` → all pass.

### Step 2: Wire the resolver into readers, and migrate on first write

- `src/server.ts` `readCommentsFromFile`: `const commentPath = await resolveExistingCommentPath(filePath);`. `writeCommentsToFile` always writes `getCommentPath(filePath)`; after a successful rename, if a legacy file exists whose `source` matches, `fs.unlink` it (one-time migration). `deleteCommentFile` and the `--clean` unlink remove both candidate paths.
- `src/share.ts` `pullComments` and `readLocalComments`: read via the resolver; `pullComments` writes to `getCommentPath`.
- `src/cli.ts` `show` and `list`: `show` reads via the resolver; `list` walks the directory and is unaffected.

**Verify**: `bun run typecheck` → exit 0. `bun run test` → all pass. Manual: create `/tmp/x/README.md` and `/tmp/x/README.html`, `bun src/cli.ts /tmp/x/README.md --no-open --port 4599`, add a comment via `curl -X POST localhost:4599/api/comments?path=/tmp/x/README.md -H 'content-type: application/json' -d '{"selectedText":"…","comment":"a","startOffset":0,"endOffset":3}'` (use text from the file), then `ls ~/.readit/comments/tmp/x/` → `README.md.comments.md` only.

### Step 3: Go parity

In `go/internal/server/storage.go` `CommentPath`: keep the extension (same rule). Add `LegacyCommentPath` and `ResolveExistingCommentPath` with the same `source:` check (parse with the existing `ParseCommentFile`). Use the resolver in `comments.go:22` (`resolveCommentsFor`) and wherever the Go server reads; write to the new path; unlink legacy after a successful write. Update `storage_test.go` expectations and add the sibling case.

**Verify**: `make test` → `ok`.

### Step 4: Docs

Update `docs/design.md` "Path Resolution Algorithm" and the examples table (`README.md → README.md.comments.md`, `review.html → review.html.comments.md`), and add a sentence: "Files written before 2026-09 used the extension-stripped name; readers fall back to that path when its `source:` matches and migrate on the next write."

**Verify**: `grep -n "review.html.comments.md" docs/design.md` → one match.

## Test plan

- `comment-storage.test.ts`: new-rule paths; sibling distinctness; legacy fallback accepted when `source` matches; legacy ignored when `source` differs.
- `storage_test.go`: same four cases.
- e2e: `e2e/persistence-file.spec.ts` continues to pass (it checks a comment file exists after commenting — update its expected filename if it hard-codes the old one; check before running).

## Done criteria

- [ ] `bun run test`, `bun run typecheck`, `make test`, `bun run test:e2e` exit 0
- [ ] `grep -rn "slice(0, -ext.length" src/lib/comment-storage.ts` → only inside `getLegacyCommentPath`
- [ ] Manual sibling check in Step 2 produces distinct files
- [ ] `docs/design.md` updated
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `e2e/persistence-file.spec.ts` asserts the exact legacy filename in a way that needs more than a one-line update (report; e2e edits need a separate decision).
- The Go `ParseCommentFile` cannot be used for the `source:` check without an import cycle.

## Maintenance notes

- Keep `getLegacyCommentPath` for at least one minor release; then delete it and the fallback.
- Reviewers: confirm no path derives from the *comment* file back to the source by stripping `.comments.md` and re-adding an extension (`readit list` reads `source:` from front matter, which is the correct approach).
