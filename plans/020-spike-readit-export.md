# Plan 020 (spike): Specify `readit export` — a machine-readable, CLI-native path for the "export for AI" promise

> **Executor instructions**: This is a design spike, not a build plan. Produce
> the deliverables listed under "Deliverables" (a design note and a thin
> prototype), run the verification commands, and stop. Do not build the full
> feature. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/lib/export.ts src/cli.ts src/lib/comment-storage.ts docs/design.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S (spike) — build estimated S for `--json/--prompt/--all`, M for an MCP server
- **Risk**: LOW
- **Depends on**: 001
- **Category**: direction
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/42

## Why this matters

The README's first sentence and `.claude/CLAUDE.md`'s overview position "export for AI coding assistants" as the product's point. Today export exists only in the browser: `generatePrompt` is consumed by two clipboard writes and `exportCommentsAsJson` builds a `Blob` and clicks an `<a download>`. The only CLI read path, `readit show`, truncates selected text to 80 characters. So the handoff to an agent is the one manual, browser-bound step in an otherwise CLI-native tool. `readit list` already walks every comment file, and `.comments.md` is the canonical format, so a `readit export` command is mostly wiring. This spike defines its surface and proves the pure-function extraction so the build is a small follow-up. It also folds in the roadmap's "bulk export across files" (v0.6.0) as `--all`.

Grounding: `docs/design.md:329-331` "Export is a Transform — Export (JSON, prompt format) is a transformation of in-memory comments, not a storage format." US-004 (Export All Comments) acceptance: "Format is AI-friendly (clear structure)". Roadmap v0.6.0 unchecked: "Bulk export across files".

## Current state

- `src/lib/export.ts` (browser-only today):
```ts
export function formatComment(c: Comment): string { const line = c.lineHint ? `[${c.lineHint}] ` : ""; return `${line}"${c.selectedText}"\n${c.comment}`; }
export function generatePrompt(comments: Comment[], fileName: string): string { return `# Review Comments for ${fileName}\n\n${comments.map(formatComment).join("\n\n---\n\n")}`; }
export function exportCommentsAsJson(comments: Comment[], document: Document): void { const data = { filePath, fileName, exportedAt, comments: comments.map(c => ({ selectedText, comment, lineHint })) }; /* Blob + <a download> */ }
```
Consumers: `src/App.svelte:~394` and `src/components/CommentManager.svelte:~57` (clipboard); `src/lib/export.bench.ts`.
- `src/cli.ts` `list` (586-620): walks `~/.readit/comments` via `findCommentFiles`, parses each, prints `source` and count. `show <file>` (622-660): parses one file, prints `[n] Lnn`, `Selected: "<first 80 chars>…"`, `Comment: …`.
- `src/lib/comment-storage.ts`: `parseCommentFile(content)` → `{ source, hash, version, comments }`; `getCommentPath(sourcePath)`.
- `src/lib/resolve-comments.ts`: `resolveComments({comments, source})` gives `anchorConfidence` and current offsets when the source is available.
- Comments have no `status`/`category`/`author` fields (`src/schema.ts` `Comment`); an export shape should leave room for them (US-007, US-011 list them as unbuilt).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test -- export` | all pass |
| Lint | `bun run check` | exit 0 |
| Prototype | `bun src/cli.ts export test.md --json` | JSON on stdout |

## Scope

**In scope (spike deliverables)**:
- `docs/plans/2026-09-XX-export-command-design.md` (create; follow the structure of `docs/plans/2026-09-02-share-design.md`: Background, Current implementation, Options, Recommendation, Appendix)
- `src/lib/export.ts` — extract `commentsToJson(comments, {filePath, fileName})` as a pure function that returns the object; `exportCommentsAsJson` becomes a thin browser wrapper around it
- `src/lib/export.test.ts` (create) — pure-function tests
- `src/cli.ts` — a **minimal** `export <file> [--json|--prompt]` command behind the existing patterns (Commander), no `--all` yet

**Out of scope**:
- `--all`, MCP server, `apply` command, status/category fields — these are design outputs, not spike code.
- Changing `show`'s output.

## Git workflow

- Branch: `advisor/020-export-spike`
- Commits: `docs: export command design`, `refactor(export): pure JSON serializer`, `feat(cli): readit export <file> --json|--prompt (spike)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Design note

Write `docs/plans/2026-09-XX-export-command-design.md` (use today's date) answering:
1. **Surface**: `readit export <file> [--json|--prompt] [--all]`, exit codes, stdout vs file, `--all` grouping (by source file, in `readit list` order). Recommend stdout-only (composable with `> out.json` and pipes).
2. **JSON shape**: reuse the browser shape (`filePath, fileName, exportedAt, comments[]`) and add `id`, `createdAt`, `anchorConfidence` (when resolvable), and reserve `status`, `category`, `author` as optional fields absent for now. For `--all`: `{ exportedAt, files: [ {filePath, fileName, comments} ] }`.
3. **Resolution**: whether `export` should re-anchor against the current source (`resolveComments`) to include `anchorConfidence` and current line hints. Recommend yes when the source file exists, else emit stored hints and `anchorConfidence: "unresolved"`.
4. **Prompt format**: keep `generatePrompt` as the `--prompt` output; note that `readit show` stays human-oriented.
5. **Options considered**: (A) `--json` flag on `show` (rejected: `show` is a human view with truncation), (B) new `export` command (recommended), (C) MCP server first (deferred: it should wrap the same functions; list the two tools it would expose: `list_reviews`, `get_comments`).
6. **Open questions** for the maintainer: hosted-mode export from a share URL (`readit export --share <url>` via `GET /api/shares/{id}/comments`), whether `--all` should include files whose source no longer exists.

**Verify**: the file exists and has the five sections plus open questions.

### Step 2: Pure serializer + tests

In `src/lib/export.ts` add `commentsToJson(comments: Comment[], doc: { filePath: string; fileName: string }, now = new Date())` returning the object; make `exportCommentsAsJson` call it. Create `src/lib/export.test.ts`: `generatePrompt` with two comments matches a snapshot-free literal; `commentsToJson` includes `id`, `lineHint`, `selectedText`, `comment`, and an ISO `exportedAt`; empty list yields `comments: []`.

**Verify**: `bun run test -- export` → pass; `bun run typecheck` → exit 0 (the Svelte callers are unchanged).

### Step 3: Minimal CLI command

In `src/cli.ts`, after `show`, add:
```ts
program.command("export <file>").description("Print comments for a file as JSON or an AI prompt")
  .option("--json", "JSON output (default)").option("--prompt", "AI prompt text")
  .action(async (file, opts) => { /* resolve path → getCommentPath → parseCommentFile → optionally resolveComments if source readable → print */ });
```
No truncation. Exit 0 with an empty result (`{"comments":[]}` / header only) when there is no comment file.

**Verify**: with an existing comment file, `bun src/cli.ts export <file> --json | bun -e 'const j=JSON.parse(await Bun.stdin.text()); console.log(Array.isArray(j.comments))'` → `true`. `--prompt` output begins with `# Review Comments for`.

## Deliverables

1. The design note (Step 1).
2. `commentsToJson` + tests (Step 2).
3. The minimal `export` command (Step 3), documented in your report with sample output.
4. A short list of follow-up plan candidates: `--all`, `--share <url>`, MCP wrapper, completions update (plan 018's completion lists should gain `export` — note it).

## Done criteria

- [ ] Design note exists at `docs/plans/2026-09-XX-export-command-design.md`
- [ ] `bun run test` exits 0 including `export.test.ts`
- [ ] `bun run typecheck`, `bun run check` exit 0
- [ ] `bun src/cli.ts export <file> --json` prints valid JSON
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The maintainer's intent doc (`docs/design.md` "Export is a Transform") conflicts with anything you are about to write into the design note — quote it and stop.
- Adding the command requires changing `show` or `list` (it should not).

## Maintenance notes

- When status/category/author land (roadmap v0.5.0, US-007, US-011), add them to `commentsToJson` and the design note's JSON shape in the same change.
- The MCP server, if built, must call `commentsToJson`/`generatePrompt` directly rather than shelling out to the CLI.
