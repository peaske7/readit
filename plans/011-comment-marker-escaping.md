# Plan 011: Make `.comments.md` round-trip any comment body, including ones that contain readit's own markers

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
- **Category**: bug / security
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/33

## Why this matters

The comment file format delimits records with an HTML comment marker `<!-- c:id|lineHint|createdAt -->` and parses by scanning for that marker anywhere in the body. Comment text is written verbatim. A comment body containing such a marker (someone reviewing readit's own docs, or pasting Markdown with HTML comments) is silently truncated at the marker on the next parse; worse, it can forge extra records with attacker-chosen ids. On a share, comment bodies come from anonymous viewers and are merged into the publisher's local file by `readit pull`, so this is also an integrity issue. The same format is parsed by three implementations (TypeScript, Go, Worker via the TypeScript module), so the change must be coordinated and backward compatible with files already on disk. `docs/design.md` names "Hackability" (editable with any text editor) as goal #1, so the escape must stay human-readable.

## Current state

- `src/lib/comment-storage.ts:92-112` `parseCommentFile`: `markerRe = /<!--\s*c:[^|]+\|[^|>\s]+(?:\|[^>]*)?\s*-->/g` over `bodyContent`; each block is `bodyContent.slice(start, end).replace(/\n+---\s*$/, "").trim()`.
- `src/lib/comment-storage.ts:117-160` `parseCommentBlock`: metadata regex, `anchorMatch = /<!--\s*anchor:(.+?)\s*-->/`, blockquote regex `/^>\s*(.+(?:\n>\s*.+)*)$/m`, `commentBody = afterBlockquote.trim()`.
- `src/lib/comment-storage.ts:163-197` `serializeComments` / `serializeComment`: front matter, then per comment the marker line, optional `<!-- anchor:… -->`, `> `-prefixed selected text lines, blank line, raw `comment.comment`, then `\n---\n`.
- Existing round-trip test for `---` inside a body: `comment-storage.test.ts:449-470` (passes because the trailing-`---` strip only applies at block end).
- Reproduced (by the audit's execution): body `see <!-- c:zzzzzzzz|L99|2020-01-01T00:00:00Z --> here` parses back as `comment: "see"`.
- Go parser: `go/internal/server/storage.go` `ParseCommentFile` uses `commentMetaRe.FindAllStringIndex(body, -1)` and `parseCommentBlock`; serializer `SerializeComments`. Test file `storage_test.go`.
- Worker imports `parseCommentFile`/`serializeComments` from the TypeScript module (`worker/src/comments.ts:1-8`), so fixing TypeScript fixes the Worker.

Conventions: format is versioned (`version: 1` in front matter, `FORMAT_VERSION`, parser throws on higher versions). Tests: `comment-storage.test.ts` round-trip style.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bun run test -- comment-storage` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Worker typecheck | `bun run build:worker && bun run typecheck:worker` | exit 0 |
| Go tests | `make test` | `ok` |

## Scope

**In scope**:
- `src/lib/comment-storage.ts` (serialize/parse only)
- `src/lib/comment-storage.test.ts`
- `go/internal/server/storage.go`, `go/internal/server/storage_test.go`
- `docs/design.md` (format section: one paragraph on escaping)

**Out of scope**:
- Bumping `FORMAT_VERSION` (not needed: the escape is backward compatible — old readers see a literal `<!-​-` … see Step 1 for the chosen scheme; if you choose a scheme old readers cannot display sensibly, STOP and report).
- Marker *validation* of ids (nice-to-have; keep the scope to escaping).

## Git workflow

- Branch: `advisor/011-comment-marker-escaping`
- Commits: `fix(storage): escape comment markers inside bodies so any text round-trips`, `fix(go): same escaping in the Go comment parser`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Choose the escape and lock it in tests first

Scheme: on serialize, replace every occurrence of the two-character sequence `<!` with `<\!` (backslash-bang) inside `comment.comment` **and** each `selectedText` line; on parse, replace `<\!` back to `<!` in both fields. Rationale: `<\!` cannot start an HTML comment, is visible and obvious in an editor (Markdown treats `\!` as a literal `!`), and legacy files never contain `<\!` unless a user typed it (accepted edge; document it). Additionally, when serializing, a body line that is exactly `---` is already handled by the parser's end-of-block strip only at the block end; leave as is (covered by the existing test).

Write the tests before changing code, in `comment-storage.test.ts`:
1. Round-trip a body containing `<!-- c:zzzzzzzz|L99|2020-01-01T00:00:00Z -->` → identical body, one comment.
2. Round-trip a body containing `<!-- anchor:fake -->` → identical body, `anchorPrefix` undefined.
3. Round-trip `selectedText` containing `<!-- c:x|L1 -->`.
4. A file with **two** real comments where the first body contains a forged marker → still two comments with the right ids.
5. A legacy file (hand-written string with an unescaped `<!--` inside a body, as the old serializer would have produced) still parses into *at least* the records it did before (documents the compatibility floor; the truncated body is accepted as legacy behavior).
6. Serialized output for a body without `<!` is byte-identical to the current serializer's output (no churn in existing files).

**Verify**: `bun run test -- comment-storage` → tests 1-4 fail, 5-6 pass.

### Step 2: Implement in TypeScript

In `serializeComment`: `const esc = (s: string) => s.replaceAll("<!", "<\\!");` apply to `comment.comment` and to each `selectedText` line before the `> ` prefix. In `parseCommentBlock`: `const unesc = (s: string) => s.replaceAll("<\\!", "<!");` apply to `selectedText` (after stripping `> `) and to `commentBody`.

**Verify**: `bun run test -- comment-storage` → all pass. `bun run typecheck && bun run typecheck:worker` → exit 0.

### Step 3: Implement in Go

Mirror in `storage.go` `SerializeComments`/`parseCommentBlock` with `strings.ReplaceAll(s, "<!", `<\!`)` and the inverse. Add the same six cases to `storage_test.go` (table-driven like `TestParseLineHint` in `anchor_test.go`).

**Verify**: `make test` → `ok`.

### Step 4: Cross-implementation fixture

Create `testdata/comment-file-escaping.md` at the repo root containing one file produced by the TypeScript serializer for a body with a forged marker, and assert in both test suites that parsing it yields one comment with the exact body. (Plan 014 introduces a broader shared fixture directory; if it landed first, put this file there.)

**Verify**: both suites read the same file and pass.

### Step 5: Docs

In `docs/design.md`, under the comment file format section, add: "Inside selected text and comment bodies, `<!` is written as `<\!` so a body can never open an HTML comment marker. Parsers reverse this."

## Test plan

Six TypeScript cases (Step 1), six Go cases (Step 3), one shared fixture (Step 4).

## Done criteria

- [ ] `bun run test` exits 0 including the six new cases
- [ ] `make test` exits 0 including the six new Go cases
- [ ] `bun run typecheck:worker` exits 0 (Worker consumes the same module)
- [ ] `git diff 6ba758c -- src/lib/comment-storage.ts | grep -c "FORMAT_VERSION"` → 0 (version unchanged)
- [ ] `docs/design.md` mentions `<\!`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Test 6 (byte-identical output for bodies without `<!`) cannot be made to pass — that means the serializer changed in an unintended way.
- The Go parser structure differs from the description (e.g. no `parseCommentBlock`); report before rewriting it.

## Maintenance notes

- Any new marker type (`<!-- status:… -->` for plan 020-adjacent work) is automatically safe as long as bodies go through `esc`/`unesc`.
- Reviewers: check both parsers un-escape `selectedText` as well as the body, since `resolveComments` matches `selectedText` against the source.
