# Plan 012: Keep multi-line `lineHint`s through resolution, compute new hints in source coordinates, and test `resolveComments`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/lib/resolve-comments.ts src/lib/anchor.ts src/lib/comment-storage.ts src/server.ts worker/src/comments.ts src/schema.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001 (006 recommended first: it fixes which HTML offsets are computed against)
- **Category**: bug / tests
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/34

## Why this matters

`resolveComments` is the one module all three servers share; it is untested. Two defects live in and around it. First, it rewrites every comment's `lineHint` to `L${anchor.line}`, discarding the end line of a multi-line selection; because every comment mutation on the local server and the Worker re-serializes the *resolved* list, one edit permanently truncates every other comment's range in the file. Second, new comments get their `lineHint` from `getLineHint(sourceMarkdown, startOffset, endOffset)` where the offsets come from the browser's rendered DOM text, not the Markdown source, so the hint drifts by the amount of Markdown syntax above the selection. `readit show` and the Zed integration print these hints; `findAnchor` uses them to seed a ±500 character window.

## Current state

- `src/lib/resolve-comments.ts` (58 lines): returns `{ ...comment, startOffset, endOffset, lineHint: \`L${anchor.line}\`, anchorConfidence }` (line 54). `Anchor` (`src/schema.ts`) has `start`, `end`, `line`, `confidence`, `distance?`; there is no end line.
- `src/lib/anchor.ts`: `findAnchor`/`findAnchorNormalized`/`findAnchorFuzzy` each build `{ start, end, line: getLineNumber(source, start), confidence }`. `getLineNumber` and `getLineHint(content, start, end)` live in `src/lib/comment-storage.ts:43-56` (`getLineHint` returns `L5` or `L5-L9`).
- Persist-the-resolved-list sites: `src/server.ts:320-326` (`addComment`: `readCommentsFromFile` → `writeCommentsToFile`), `updateComment`, `deleteComment`, `reanchorComment`; `worker/src/comments.ts:51-58` + `saveComments`.
- New-comment hint: `src/server.ts:311-318` `createComment(selectedText, commentText, startOffset, endOffset, currentContent)` → `getLineHint(sourceContent, startOffset, endOffset)` (`comment-storage.ts:210`). The offsets are DOM-text offsets from `src/lib/highlight/highlighter.ts` posted by `src/App.svelte:136-141`. Same in `worker/src/comments.ts:82-89` and the reanchor branches (`src/server.ts` ~446, `worker/src/comments.ts:119`).
- DOM text ↔ source: `src/lib/html-text.ts` `extractTextFromHtml(html)` produces the DOM text the client offsets index into; `src/lib/highlight/resolver.ts` `findTextPosition(text, selected, hint)` finds a selection in a text. There is no DOM-offset→source-offset map, but `findAnchorWithFallback({ source, selectedText, lineHint })` already finds the selection in the source given the text.
- Go: `go/internal/server/comments.go:63-72` resolves similarly; its `lineHint` handling is out of scope here (plan 014 aligns Go with TS).
- Tests: none reference `resolveComments`. `src/lib/anchor.test.ts` is the structural model (pure functions, fixtures inline or from `__fixtures__/bench-data.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bun run test -- resolve-comments anchor comment-storage` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Worker typecheck | `bun run build:worker && bun run typecheck:worker` | exit 0 |
| e2e | `bun run test:e2e` | all pass |

## Scope

**In scope**:
- `src/lib/resolve-comments.ts`, `src/lib/resolve-comments.test.ts` (create)
- `src/lib/anchor.ts` (add `endLine` to results) and `src/schema.ts` (`Anchor.endLine`)
- `src/lib/comment-storage.ts` (`createComment` signature gains a source-space hint path; see Step 3)
- `src/server.ts` and `worker/src/comments.ts` (call sites of `createComment` / reanchor hint)
- `src/lib/anchor.test.ts` (assert `endLine`)

**Out of scope**:
- Go server (plan 014).
- Changing what the client sends (`App.svelte`); the server derives the source-space hint.
- Frontend display of hints.

## Git workflow

- Branch: `advisor/012-line-hint-preservation`
- Commits: `fix(anchor): keep the end line of multi-line selections through resolution`, `fix(server): compute new comment line hints in source coordinates`, `test: resolveComments coverage`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Characterize `resolveComments` before changing it

Create `src/lib/resolve-comments.test.ts` with a small source:
```ts
const SOURCE = "# Title\n\nFirst paragraph with **bold** text.\n\nSecond paragraph\nspans two lines.\n";
const HTML = "<h1>Title</h1><p>First paragraph with <strong>bold</strong> text.</p><p>Second paragraph\nspans two lines.</p>";
```
Cases (write them so the *intended* behavior is asserted; mark the ones that fail today with `it.fails` and flip them in Steps 2-3):
1. Exact match: `selectedText: "bold"`, `lineHint: "L3"` → `anchorConfidence: "exact"`, source offsets when `html` omitted.
2. With `html`: offsets index into `extractTextFromHtml(HTML)` (assert `domText.slice(start, end) === "bold"`).
3. Unresolved: `selectedText: "missing"` → `anchorConfidence: "unresolved"`, original offsets unchanged.
4. **Multi-line hint preserved** (`it.fails` today): `selectedText: "Second paragraph\nspans"`, `lineHint: "L5-L6"` → resolved `lineHint === "L5-L6"`.
5. Hint corrected when stale: `selectedText: "bold"`, `lineHint: "L1"` → `lineHint === "L3"`.
6. Normalized and fuzzy confidences each reachable with one fixture (whitespace change; one-char typo).

**Verify**: `bun run test -- resolve-comments` → 5 pass, 1 expected failure.

### Step 2: Carry the end line through anchors

- `src/schema.ts`: add `endLine: number` to `Anchor`.
- `src/lib/anchor.ts`: at every `return { start, end, line: …, confidence }` add `endLine: getLineNumber(source, Math.max(start, end - 1))` (end is exclusive; use `end - 1` clamped so a selection ending at a newline does not roll to the next line).
- `src/lib/resolve-comments.ts` line 54: `lineHint: anchor.line === anchor.endLine ? \`L${anchor.line}\` : \`L${anchor.line}-L${anchor.endLine}\`` — or reuse `getLineHint(source, anchor.start, anchor.end)` from `comment-storage.ts`, which already produces this format (prefer reuse; then `endLine` on `Anchor` is unnecessary — choose reuse and skip the schema change unless `anchor.test.ts` benefits).
- `src/lib/anchor.test.ts`: if you added `endLine`, assert it in two existing cases.

**Verify**: flip case 4 to `it(`; `bun run test -- resolve-comments anchor` → all pass.

### Step 3: Source-space hints for new and re-anchored comments

The server has the selected text and the source; find the selection in the source and hint from *that*:
```ts
// src/lib/comment-storage.ts
export function sourceLineHint(source: string, selectedText: string, fallbackHint: string): string {
  const anchor = findAnchorWithFallback({ source, selectedText, lineHint: fallbackHint });
  return anchor ? getLineHint(source, anchor.start, anchor.end) : fallbackHint;
}
```
`anchor.ts` imports `getLineNumber` from `comment-storage.ts`, so putting `sourceLineHint` in `comment-storage.ts` creates a cycle. Put it in `src/lib/resolve-comments.ts` instead (which already imports both), and export it.

Call sites: in `src/server.ts` `addComment` (line ~311) compute `const hint = sourceLineHint(currentContent, selectedText, getLineHint(currentContent, startOffset, endOffset))` and pass it into `createComment` — extend `createComment` with an optional sixth parameter `lineHint?: string` that overrides the computed one. Same in the reanchor branch (~446) and in `worker/src/comments.ts:82-89` and `:119`.

**Verify**: add case 7 to `resolve-comments.test.ts`: `sourceLineHint(SOURCE, "spans two lines.", "L1")` → `"L6"` (DOM offset of that text would have said an earlier line). `bun run typecheck && bun run typecheck:worker && bun run test` → exit 0. `bun run test:e2e` → pass (`e2e/comments.spec.ts` adds comments end-to-end).

## Test plan

- `resolve-comments.test.ts`: 7 cases above.
- `anchor.test.ts`: `endLine` assertions if added.
- e2e regression via existing specs.

## Done criteria

- [ ] `bun run test` exits 0; `resolve-comments.test.ts` exists with ≥ 7 tests and no `it.fails`
- [ ] `grep -n 'lineHint: `L${anchor.line}`' src/lib/resolve-comments.ts` → no matches
- [ ] `grep -n "sourceLineHint" src/server.ts worker/src/comments.ts` → ≥ 2 matches each file
- [ ] `bun run typecheck`, `bun run typecheck:worker`, `bun run test:e2e` exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `findAnchorWithFallback` cannot locate a freshly selected text in the source for a common case (e.g. selections spanning inline code) — report the fixture; do not widen thresholds.
- Import cycle cannot be avoided without moving `getLineNumber` (report; moving it is acceptable but note it).

## Maintenance notes

- Plan 014 must make the Go server produce the same `lineHint` strings (range form) for the shared fixture.
- Reviewers: check that `readit show` output now prints `L5-L9` for multi-line comments after one edit cycle.
