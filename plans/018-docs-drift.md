# Plan 018: Bring the version, architecture tree, README, and shell completions back in line with the code

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- README.md AGENTS.md .claude/CLAUDE.md .claude/roadmap.md .claude/user-stories.md docs/design.md shell/_readit src/cli.ts Makefile package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (001 recommended so `make test` documentation is accurate)
- **Category**: docs / dx
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/40

## Why this matters

The entry-point documents disagree with the code in ways that mislead both users and agents: the README's first sentence promises a capability that does not exist, the roadmap says v0.8.0 shipped while the package is `0.4.0-rc.1`, the architecture tree in `.claude/CLAUDE.md` (the first file agents are told to read) is wrong in about 25 places, `make dev` fails as documented, and the shell completions omit every sharing command. Each fix is small; together they remove the most common wrong turns.

## Current state

1. **Version vs roadmap**: `package.json:3` `"version": "0.4.0-rc.1"`. `.claude/roadmap.md` marks v0.4.0, v0.7.0, v0.8.0 as ✅ (v0.8.0 = sharing, which is on this branch), while v0.3.0 is "in progress" and v0.5.0/v0.6.0 have unchecked items. `.github/workflows/release.yml:35-42` fails a tag that does not equal `package.json` version. No `CHANGELOG.md`.
2. **README first sentence** (`README.md:3`): "…then export for AI or apply back to source." `AGENTS.md:14`: "export comments for AI or apply back to Markdown". No `apply` command exists (`src/cli.ts` commands: `list`, `show`, `remote setup|list`, `share`, `unshare`, `pull`, `zed-open`, `zed-lsp`, `open`, `completion`, default). Plan 020 specs an `export` command; do not promise `apply`.
3. **Architecture tree** (`.claude/CLAUDE.md:66-166`): lists `src/components/MarginNote.svelte` (does not exist); omits 13 components (`BodyMarkers`, `CodeBlockEnhancer`, `CommentErrorBanner`, `CommentPopover`, `ConnectionBanner`, `FloatingComment`, `MarginCluster`, `MarginEntry`, `MarginGroupEntry`, `MermaidEnhancer`, `MermaidModal`, `TableEnhancer`, `Toast`), `ui/Kbd.svelte`, stores `connection.svelte.ts` and `toast.svelte.ts`, lib modules `clustering.ts`, `code-block.ts`, `comment-drafts.ts`, `context.ts`, `fetch-or-throw.ts`, `key-lock.ts`, `relative-time.ts`, `table-layout.ts`, and the top-level `zed-readit/` plus `src/zed-lsp.ts`. Since `6ba758c` also add: `src/lib/readit-home.ts` (every `~/.readit` path, `READIT_HOME` override), `src/lib/share-snapshot.ts` (share format shared by CLI and Worker), `src/lib/client.ts` (frontend server client), `docs/api-contract.md`, `test/contract/` (cross-server suite, `bun run test:contract`), `worker/test/`, `vitest.contract.config.ts`; and remove `src/lib/api.ts` and `src/lib/fetch-or-throw.ts` (deleted). The tree's last line says `CLAUDE.md  # This file` at the repo root, but the file lives at `.claude/CLAUDE.md`. (Verified with `ls src/components src/components/ui src/lib src/stores` on 2026-09-04.)
4. **`make dev`** (`Makefile:5-6`): `cd go && go run ./cmd/readit -- --dev $(ARGS)`; `go/cmd/readit/main.go:86-89` exits 1 with `Error: at least one file is required` when no file is given. `.claude/CLAUDE.md` documents `make dev` without `ARGS`.
5. **Completions**: `shell/_readit:113-118` (zsh compdef), `src/cli.ts` `generateZshCompletion` (~1148-1156), `generateBashCompletion` (`commands="open zed-open zed-lsp list show completion"`, ~1181), `generateFishCompletion` (~1216-1221) — none list `share`, `pull`, `unshare`, `remote`. `README.md:76-80` describes the completion set as `open`, `list`, `show`, `completion`.
6. **Stale status lines**: (the "Server API" section of `docs/design.md` was already fixed in `6ba758c` to point at `docs/api-contract.md`.) `docs/design.md:17-38` section "Current State (localStorage)" describes the pre-v0.2.0 backend as current; `.claude/user-stories.md` US-011 has "Partially implemented (v0.8.0)" at the top and "**Status:** Not implemented (future consideration)" at the bottom (line ~196); `.claude/CLAUDE.md:196` and US-007 say resolution status is "planned for v0.3.0" while v0.3.0 has no such item.
7. `README.md:207` points to `vscode-readit/` "for details" but that directory has no README; `zed-readit/` (a real extension, see `docs/plans/2026-06-02-zed-extension-design.md`) is not mentioned.
8. `.claude/commands/sync-docs.md` exists (a slash command for syncing docs) — read it; if it prescribes a procedure, follow it for the tree regeneration.

Conventions: conventional commits `docs: …`; Markdown tables in README.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `bun run check` | exit 0 |
| Completions build | `bun src/cli.ts completion zsh \| grep -c "share"` | ≥ 1 |
| Typecheck | `bun run typecheck` | exit 0 |

## Scope

**In scope**:
- `README.md`, `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/roadmap.md`, `.claude/user-stories.md`, `docs/design.md`
- `CHANGELOG.md` (create)
- `Makefile` (`dev` default `ARGS`)
- `shell/_readit`, `src/cli.ts` (completion generator strings only)
- `vscode-readit/README.md` (create, short)
- `package.json` version — **only if the operator has decided the numbering**; see Step 1

**Out of scope**:
- Any behavior change in `src/cli.ts` beyond the completion string literals.
- Writing the `export` command (plan 020) or `apply`.

## Git workflow

- Branch: `advisor/018-docs-drift`
- Commits: `docs: reconcile version numbering and add CHANGELOG`, `docs: regenerate the CLAUDE.md architecture tree`, `docs: README accuracy (apply, completions, editor integrations)`, `feat(cli): complete share, pull, unshare, and remote in all shells`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Version numbering — decide, then record

Two consistent options: (a) bump `package.json` to `0.8.0-rc.1` to match the roadmap; (b) renumber the roadmap so the sharing milestone is `v0.4.0`. The release workflow only requires the tag to equal `package.json`. **Do not change `package.json` yourself** unless the operator has stated a choice; instead implement (b)'s doc side minimally: in `.claude/roadmap.md`, add a one-line note under the title: "Version numbers below are milestone labels; the npm package version is in `package.json` (currently 0.4.0-rc.1 — sharing ships as the next release)." Then create `CHANGELOG.md` in Keep-a-Changelog format with an `## [Unreleased]` section listing the sharing feature bullets from the v0.8.0 roadmap section and the fixes from `git log --oneline 3952eac..HEAD`.

**Verify**: `test -f CHANGELOG.md && grep -c "Unreleased" CHANGELOG.md` → 1.

### Step 2: Regenerate the architecture tree

Replace the tree in `.claude/CLAUDE.md:66-166` with one generated from the filesystem. Keep the one-line role comments where they exist and are still true; add roles for new files from their top-of-file doc comments (`head -5` each). Fix the last line to `.claude/CLAUDE.md  # This file`. Add `zed-readit/` and `src/zed-lsp.ts`. Remove `MarginNote.svelte`. Add `plans/` with the line `# Advisor implementation plans (see plans/README.md)`.

**Verify**: for every path in the tree that looks like a file, `test -e` it: `grep -oE '^\s*[│├└─ ]*[A-Za-z0-9_./-]+\.(ts|svelte|go|lua|md|css|toml|json)' .claude/CLAUDE.md` piped through a small loop against the repo root → zero missing. And the reverse: `ls src/components src/lib src/stores` names all appear in the file (`grep -c`).

### Step 3: README and AGENTS accuracy

- `README.md:3`: "…then export for AI." (drop "or apply back to source"). `AGENTS.md:14`: "User can export comments for AI assistants."
- `README.md:76-80`: list `open`, `list`, `show`, `share`, `pull`, `unshare`, `remote`, `completion`.
- `README.md:207`: replace "See vscode-readit/ for details" with two sentences from `vscode-readit/package.json`'s description and how to run it (`bun install && bun run build` in that directory, then Install from VSIX / Run Extension). Create `vscode-readit/README.md` with the same content plus the commands table from its `package.json` `contributes.commands`.
- Add a short "Zed extension" paragraph pointing at `zed-readit/` and `docs/plans/2026-06-02-zed-extension-design.md`, keeping the existing task-based recipe.

**Verify**: `grep -n "apply back" README.md AGENTS.md` → no matches.

### Step 4: `make dev`

`Makefile`: `ARGS ?= ../test.md` (relative to `go/`, since the recipe `cd go`s first — confirm `test.md` exists at the repo root; it does). Document in `.claude/CLAUDE.md`: `make dev ARGS=path/to/file.md  # Go server + Vite HMR (defaults to ../test.md)`.

**Verify**: `make -n dev` prints the command with `../test.md`.

### Step 5: Completions

Add `share`, `pull`, `unshare`, `remote` (with `setup`/`list` sub-values) to: `shell/_readit` `commands=(…)` and its `args)` case (`share|pull|unshare` take a markdown file; `remote` takes `setup|list`); `generateZshCompletion`, `generateBashCompletion` (`commands=` string and the `case` for file completion), `generateFishCompletion` (new `complete -c readit -n '__fish_use_subcommand' -a 'share' …` lines, and `__fish_seen_subcommand_from share pull unshare` file completion; `remote` → `setup list`). Also add `--public` and `--password` options for `share` in fish.

**Verify**: `for s in zsh bash fish; do bun src/cli.ts completion $s | grep -c "unshare"; done` → each ≥ 1. `grep -c "unshare" shell/_readit` → ≥ 1. `bun run check` → exit 0.

### Step 6: Stale status lines

- `docs/design.md:17`: retitle to "## Prior State (localStorage, before v0.2.0)" and add one sentence that file-based storage replaced it.
- `.claude/user-stories.md` US-011: delete the trailing "**Status:** Not implemented (future consideration)" line.
- `.claude/CLAUDE.md:196` and US-007: change "planned for v0.3.0" to "not yet scheduled (see plans/020 and the roadmap)".

**Verify**: `grep -n "planned for v0.3.0" .claude/CLAUDE.md .claude/user-stories.md` → no matches.

## Test plan

Docs only; verification is the greps above plus `bun run check`.

## Done criteria

- [ ] All Step verifications pass
- [ ] `CHANGELOG.md` exists
- [ ] `.claude/CLAUDE.md` tree has no nonexistent paths and lists every file in `src/components`, `src/lib`, `src/stores`
- [ ] All three completion generators and `shell/_readit` mention `share`, `pull`, `unshare`, `remote`
- [ ] `bun run check`, `bun run typecheck` exit 0
- [ ] `package.json` unchanged unless the operator decided the version (state which in your report)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `.claude/commands/sync-docs.md` prescribes a different procedure for the tree (follow it instead and note that).
- The operator's intended version scheme is unknown and a step requires it (only Step 1 does; it is written to avoid needing it).

## Maintenance notes

- Consider trimming the CLAUDE.md tree to directory level with a sentence each; file-level trees drift on every feature.
- Reviewers: run `readit completion zsh` in a fresh shell and tab-complete `readit sh<TAB>`.
