# Plan 014: Make the Go server's anchor resolution match TypeScript, emit UTF-16 offsets, and pin both to one fixture

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- go/internal/server/anchor.go go/internal/server/anchor_test.go go/internal/server/htmltext.go go/internal/server/comments.go go/internal/server/storage.go src/lib/anchor.ts src/lib/anchor.test.ts src/lib/resolve-comments.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001, 012 (TypeScript is the reference; land its hint fix first)
- **Category**: bug / tech-debt
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/36

## Why this matters

The Go binary reimplements anchor resolution and returns **byte** offsets from `strings.Index` where the Svelte client indexes JavaScript strings (UTF-16 code units). Any non-ASCII text before a comment shifts its highlight rightward — three bytes per CJK character — so the Go server is effectively ASCII-only for a project that ships Japanese translations. Beyond that, five behavioral differences exist between `anchor.go` and `anchor.ts` (normalized-match guard, window size/units, trailing-whitespace direction, fuzzy iteration order, whitespace class), and the Go server passes the 200-char `anchorPrefix` to the DOM search where TypeScript passes the full `selectedText`. Nothing detects drift: the two test suites share no inputs. The share design doc (`docs/plans/2026-09-02-share-design.md` §2) states the constraint: "Two server implementations, one contract."

## Current state

TypeScript (normative, has the 527-line suite `src/lib/anchor.test.ts`):
- `src/lib/anchor.ts:4-7` constants `DEFAULT_SEARCH_WINDOW = 500`, `DEFAULT_FUZZY_THRESHOLD = 5`, `MAX_FUZZY_TEXT_LENGTH = 200`, `FUZZY_SEARCH_WINDOW = 2000`.
- `:30` `normalizeWhitespace` uses `/\s+/g` (includes NBSP, full-width space).
- `findAnchorNormalized` (`:189-235`): bails if `normalizedText === selectedText`; default window `FUZZY_SEARCH_WINDOW` (2000 raw chars); extends `originalEnd` **forward** over whitespace (`:223-225`).
- `findAnchorFuzzy` (`:280-313`): iterates `len` (shortest first) then position; early return on distance 0.
- `src/lib/resolve-comments.ts:23,38-43`: source anchor uses `anchorPrefix || selectedText`; DOM position uses `comment.selectedText`.
- Offsets are UTF-16 code units (JS strings). `src/lib/highlight/resolver.ts` `findTextPosition`.

Go:
- `go/internal/server/anchor.go:50-77` exact match: `strings.Index` → byte offsets.
- `:79-93` `normalizeWhitespace`: only `' ' \t \n \r`.
- `:95-125` `FindAnchorNormalized`: bails only when both text **and** source are already normalized; window `DefaultSearchWindow` (500) in **runes** of the normalized source.
- `:127-133` `resolveNormalizedMatch`: trims `origEnd` **backward**.
- `:195-230` fuzzy: position-major then length; no early exit; converts rune index → byte offset.
- `go/internal/server/htmltext.go:93-119` `FindTextPosition`: byte offsets (`strings.Index`, `len(selectedText)`).
- `go/internal/server/comments.go:63-76`: `searchText := c.SelectedText; if c.AnchorPrefix != "" { searchText = c.AnchorPrefix }` then **both** `FindAnchorWithFallback(sourceContent, searchText, …)` and `FindTextPosition(domText, searchText, …)`.
- `go/internal/server/storage.go` `TruncateSelection` counts runes; TS `truncateSelection` counts UTF-16 units (`src/lib/comment-storage.ts:12-20`).
- Constants duplicated at `go/internal/server/types.go:77-100`.
- Tests: `go/internal/server/anchor_test.go` (111 lines, ASCII only), `src/lib/anchor.test.ts`.

Conventions: Go tests table-driven; `go test ./...` from `go/`; commit `fix(go): …`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Go tests | `make test` | `ok` |
| TS tests | `bun run test -- anchor resolve-comments` | all pass |
| Go build | `cd go && go build ./...` | exit 0 |
| Manual Go server | `make build && ./dist/readit <file.md> --no-open` | serves |

## Scope

**In scope**:
- `testdata/anchor-cases.json` (create, repo root)
- `src/lib/anchor-fixture.test.ts` (create) — consumes the fixture through `resolveComments`
- `go/internal/server/anchor_fixture_test.go` (create) — consumes the same file
- `go/internal/server/anchor.go`, `htmltext.go`, `comments.go` (behavior), `storage.go` (`TruncateSelection` unit)
- `go/internal/server/anchor_test.go` (update expectations if any encode divergent behavior)

**Out of scope**:
- Any change to `src/lib/anchor.ts` behavior (it is the reference). Only add the fixture consumer.
- API route shapes.

## Git workflow

- Branch: `advisor/014-go-anchor-parity`
- Commits: `test: shared anchor conformance fixture for TS and Go`, `fix(go): UTF-16 offsets at the API boundary`, `fix(go): match TypeScript anchor semantics`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Generate the fixture from TypeScript

Write a one-off script (keep it under `scripts/gen-anchor-fixture.ts`, committed) that builds `testdata/anchor-cases.json`:
```json
[
  { "name": "exact ascii", "source": "…", "html": "…", "selectedText": "…", "lineHint": "L3",
    "expect": { "startOffset": 12, "endOffset": 16, "lineHint": "L3", "anchorConfidence": "exact" } },
  …
]
```
Cases (at least 12): exact ASCII; exact after CJK text (`"日本語の段落。\n\nHello world."` selecting `Hello`); selection *of* CJK text; normalized (whitespace collapsed) match; normalized match with trailing newline in the selection; NBSP inside the selection (` `); fuzzy one-char typo; fuzzy where shortest-candidate tie-breaking matters; unresolved; multi-line selection (hint `L5-L6`); text over 1000 chars with `anchorPrefix` (DOM position must use full `selectedText`); duplicate occurrences resolved by proximity to the hint. Expected values are produced by running `resolveComments` (TypeScript) — that is what makes TS the reference. Include `html` so the DOM-position path is exercised; compute `expect` with `html` supplied.

`src/lib/anchor-fixture.test.ts`: load the JSON, run `resolveComments({comments:[{id:"x", selectedText, lineHint, comment:"", startOffset:0, endOffset:0, anchorPrefix}], source, html})`, assert equality with `expect`. This must pass trivially (it is how the file was generated) and pins TS behavior.

**Verify**: `bun run test -- anchor-fixture` → all pass.

### Step 2: Go consumes the fixture (expect failures)

`go/internal/server/anchor_fixture_test.go`: read `../../../testdata/anchor-cases.json`, for each case build a `Comment` and run the same path the server uses (`resolveCommentsFor` is a method on `Server`; extract the per-comment logic from `comments.go:63-80` into a pure function `resolveOne(source, domText string, c Comment) Comment` first, with no behavior change, and call that). Compare `StartOffset`, `EndOffset`, `LineHint`, `AnchorConfidence`.

**Verify**: `make test` → the fixture test fails on the CJK and divergence cases; ASCII exact passes. Record which fail.

### Step 3: UTF-16 at the boundary

Add to `htmltext.go`:
```go
// utf16Offset converts a byte offset in s to a UTF-16 code-unit offset.
func utf16Offset(s string, byteOff int) int {
	n := 0
	for i, r := range s { if i >= byteOff { break }; if r >= 0x10000 { n += 2 } else { n++ } }
	return n
}
```
In `resolveOne`, after computing byte offsets (source or DOM), convert both `StartOffset` and `EndOffset` with `utf16Offset(textTheyIndexInto, …)`. Keep bytes internal.

**Verify**: `make test` → CJK exact case passes.

### Step 4: Match TypeScript semantics

Edit `anchor.go`:
1. `normalizeWhitespace`: use `unicode.IsSpace(r)` (covers NBSP and full-width space; matches `\s` closely enough — if the fixture NBSP case still differs, special-case ` `, `　`, `﻿` per JS `\s`).
2. `FindAnchorNormalized`: bail when `normText == selectedText` (drop the `normSource == source` conjunct); window = `FuzzySearchWindow` (2000) in **bytes of the raw source** around the hint, then normalize that window (mirror TS: `window := source[windowStart:windowEnd]` → normalize → search), instead of normalizing the whole source and windowing in runes.
3. `resolveNormalizedMatch`: extend `origEnd` **forward** while `unicode.IsSpace` (mirror `anchor.ts:223-225`), do not trim backward.
4. Fuzzy: iterate `candLen` outer (shortest first) and position inner; return immediately on distance 0; use `<` so the first minimum wins (TS keeps the first best because it updates only on strictly smaller distance).
5. `comments.go` `resolveOne`: pass `c.SelectedText` (not `searchText`) to `FindTextPosition`; produce `LineHint` in range form via a Go `GetLineHint(source, start, end)` (plan 012's TS behavior).
6. `storage.go` `TruncateSelection`: count UTF-16 units, not runes, so both servers write identical `selectedText` for the same selection (a helper `utf16Len` and slicing by UTF-16 index; or convert to `[]uint16` via `unicode/utf16.Encode`).

**Verify**: `make test` → fixture test all pass; existing `anchor_test.go` passes (update any expectation that encoded the old backward trim or tie-break).

### Step 5: Guard against drift

Add a CI note in the fixture files' headers: "Regenerate with `bun scripts/gen-anchor-fixture.ts`; both suites must pass on the same file." Add `bun scripts/gen-anchor-fixture.ts --check` mode that regenerates to a temp path and diffs against the committed file, and run it in the CI `frontend` job.

**Verify**: `bun scripts/gen-anchor-fixture.ts --check` → exit 0.

## Test plan

- `testdata/anchor-cases.json` ≥ 12 cases; consumed by `anchor-fixture.test.ts` and `anchor_fixture_test.go`.
- Existing suites stay green.

## Done criteria

- [ ] `make test` exits 0 including `anchor_fixture_test.go`
- [ ] `bun run test` exits 0 including `anchor-fixture.test.ts`
- [ ] `grep -n "utf16Offset" go/internal/server/*.go` → definition plus ≥ 2 uses
- [ ] `grep -n "FindTextPosition(domText, searchText" go/internal/server/comments.go` → no matches
- [ ] `bun scripts/gen-anchor-fixture.ts --check` exits 0
- [ ] `src/lib/anchor.ts` unchanged versus `6ba758c` (`git diff --stat 6ba758c -- src/lib/anchor.ts` empty)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A fixture case cannot be made to pass in Go without changing TS behavior — report the case; TS is the reference and a TS bug found this way is a new finding, not something to paper over.
- `resolveCommentsFor` cannot be split into a pure `resolveOne` without touching the cache logic (report).

## Maintenance notes

- Every anchor behavior change starts by adding a fixture case and regenerating; Go follows.
- Reviewers: run the Go binary on a Japanese document with a comment and confirm the highlight lands (this was the user-visible bug).
