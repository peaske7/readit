# Plan 001: Make every documented verification command pass on a clean checkout

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- Makefile go/internal/server/embed.go .gitignore src/lib/anchor.test.ts src/lib/comment-storage.test.ts package.json .github/workflows/ e2e/utils/cli.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx / tests
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/24

## Why this matters

Every other plan in this directory ends with "run the tests and confirm green". Today that is not possible from a clean checkout: the Go module refuses to compile without a Vite build in place, `bun run test` is red because of three wall-clock assertions that fail on any loaded machine, and `bun run test:e2e` fails with an opaque timeout unless someone remembers to build first. CI on this branch has run at most once (the branch was unpushed until 2026-09-04). This plan makes the six documented commands deterministic so executors can trust their gates.

## Current state

Files and their roles:

- `go/internal/server/embed.go` — embeds the built frontend. Line 8: `//go:embed all:dist`. The directory `go/internal/server/dist/` is gitignored (`.gitignore` line 6 pattern `dist` matches at any depth) and not tracked: `git ls-files go/internal/server/dist` prints nothing. Verified: extracting `git archive HEAD go` to a temp dir and running `go build ./...` fails with `internal/server/embed.go:8:12: pattern all:dist: no matching files found`.
- `Makefile` lines 22-23: `test:` runs `cd go && go test ./...` with no dependency on `build-client`. `make clean` (lines 34-37) creates `go/internal/server/dist/.gitkeep`, which is the intended placeholder, but it is never committed.
- `.github/workflows/ci.yml` — the `go` job was fixed in commit `6ba758c` to run `bunx vite build` and copy `dist/` into `go/internal/server/dist/` before `go test`. That fix is correct and must be kept; this plan aligns the Makefile and local flow with it.
- `src/lib/anchor.test.ts` lines 512 and 525, and `src/lib/comment-storage.test.ts` line 692 — three assertions of the form `expect(elapsed).toBeLessThan(50)` measuring `performance.now()`. Observed locally on 2026-09-04: the fuzzy case measured 187 ms and failed while the other 222 tests passed. The fuzzy loop in `src/lib/anchor.ts:289-313` is inherently ~44k Levenshtein calls, so 50 ms is a machine-dependent constant, not a correctness property.

```ts
// src/lib/anchor.test.ts:516-526 (current)
  it("findAnchorWithFallback fuzzy fallback completes within 50ms (10 iterations)", () => {
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      findAnchorWithFallback({ source: LARGE_DOC, selectedText: fuzzyText, lineHint: "L250" });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
```

- `src/lib/anchor.bench.ts`, `src/lib/comment-storage.bench.ts` — existing Vitest benchmarks (`bun run bench`) that already cover the same functions. The repo convention for performance measurement is `bench()`, not timed `it()` blocks.
- `package.json` line 39: `"test:e2e": "playwright test --project=chromium"`. `e2e/utils/cli.ts:16` resolves `dist/index.js` and line 53-55 rejects with `"Server did not start within timeout"` after 10 s when it is absent. CI runs `bun run build` first (`ci.yml` e2e job); locally nothing does.
- All three workflows use `bun-version: latest` (five jobs in `ci.yml` including the new `contract` job, plus `release.yml` and `deploy-worker.yml`). Local Bun is 1.4.0 (`bun --version`).

Repo conventions: conventional commits (`ci: …`, `chore: …`, `test: …`); Biome formatting (`bun run check:fix`); tests co-located as `*.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 (one `info` about the Biome schema version is acceptable) |
| Unit tests | `bun run test` | all pass |
| Benchmarks | `bun run bench` | exit 0 |
| Go (fresh clone) | `make test` | `ok  github.com/peaske7/readit/go/internal/server` |
| Build | `bun run build` | `dist/index.js` exists |
| e2e | `bun run test:e2e` | all pass |
| Contract | `bun run build && bun run test:contract` | Bun adapter passes; Go/Worker adapters skip unless built |

## Scope

**In scope**:
- `go/internal/server/dist/.gitkeep` (create, and un-ignore it)
- `.gitignore`
- `Makefile`
- `src/lib/anchor.test.ts`, `src/lib/comment-storage.test.ts`
- `src/lib/anchor.bench.ts`, `src/lib/comment-storage.bench.ts` (only if a bench case for the moved assertion does not already exist)
- `package.json` (`test:e2e` script only)
- `.github/workflows/ci.yml`, `release.yml`, `deploy-worker.yml` (pin `bun-version` only)
- `.claude/CLAUDE.md` Quick Reference block (one line documenting `make test` behavior)

**Out of scope**:
- Any source file under `src/` other than the two test files.
- `biome.json` schema version (cosmetic; separate chore).
- Adding new tests (plans 004, 009, 012, 013 do that).

## Git workflow

- Branch: `advisor/001-verification-baseline`
- Commits: `ci: keep go/internal/server/dist present so go builds on a clean checkout`, `test: move wall-clock anchor assertions to benchmarks`, `chore: build before e2e and pin bun in workflows`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the Go module compile without a frontend build

1. Create an empty file `go/internal/server/dist/.gitkeep`.
2. In `.gitignore`, after the line `dist`, add a negation so the placeholder is tracked:
   ```
   !go/internal/server/dist/.gitkeep
   ```
   (Git cannot re-include a file whose parent directory is excluded; if `git add go/internal/server/dist/.gitkeep` still reports "ignored", change the ignore to explicit patterns: replace `dist` with `/dist` and `go/internal/server/dist/*` plus `!go/internal/server/dist/.gitkeep`.)
3. In `Makefile`, make `test` depend on `build-client` and the copy step, mirroring CI:
   ```make
   test: build-server
   	cd go && go test ./...
   ```
   Also add a `test-go-only` target that runs `go test` without rebuilding, for the inner loop.

**Verify**: `git check-ignore -v go/internal/server/dist/.gitkeep` → prints nothing (exit 1 means not ignored). Then simulate a fresh clone:
```bash
S=$(mktemp -d) && git stash -u -q 2>/dev/null; git archive HEAD go .gitignore | tar -x -C "$S"; git stash pop -q 2>/dev/null; (cd "$S/go" && go build ./... && echo GO_BUILD_OK)
```
→ `GO_BUILD_OK`. (If you did not stash anything the `stash pop` prints an error you can ignore.)

### Step 2: Move the three wall-clock assertions to benchmarks

1. Delete the `describe("performance", …)` block at `src/lib/anchor.test.ts:498-527` and the one at `src/lib/comment-storage.test.ts:686-694`.
2. Confirm `src/lib/anchor.bench.ts` already has a `findAnchorWithFallback` fuzzy case; if not, add one modeled on the existing `bench("medium doc (150 lines)", …)` entries. Same for `parseCommentFile` in `src/lib/comment-storage.bench.ts`.
3. Keep the correctness value of the removed tests: add one non-timed test in `anchor.test.ts` asserting the fuzzy call returns a match with `confidence: "fuzzy"` for `fuzzyText` against `LARGE_DOC` (the result, not the duration).

**Verify**: `bun run test` → `Test Files  16 passed`, `Tests  … passed`, 0 failed. `bun run bench` → exit 0.

### Step 3: Build before e2e

In `package.json` change:
```json
"test:e2e": "bun run build && playwright test --project=chromium",
```
Leave `test:e2e:ui` and `test:perf` as they are.

**Verify**: `rm -rf dist && bun run test:e2e` → Playwright reports all specs passed (4 spec files). If Chromium is not installed: `bunx playwright install chromium` first.

### Step 4: Pin Bun in workflows

Replace every `bun-version: latest` in the three workflow files with `bun-version: 1.4.0` (every occurrence). Add a comment above the first one: `# Pinned so a Bun release cannot turn CI red without a repo change; bump deliberately.`

**Verify**: `grep -rn "bun-version" .github/workflows/` → every line shows `1.4.0`.

### Step 5: Document

In `.claude/CLAUDE.md` Quick Reference, next to `make test`, note: `# Builds the frontend first (go:embed needs dist/)`.

**Verify**: `bun run check` → exit 0.

## Test plan

- No new test files. Step 2 adds one result-asserting test replacing three timing tests.
- Verification: `bun run test` all green; `bun run bench` exit 0; `make test` from a clean tree exit 0.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0 with 0 failures
- [ ] `grep -rn "toBeLessThan(50)" src/` returns no matches
- [ ] `git ls-files go/internal/server/dist/.gitkeep` prints the path
- [ ] Fresh-archive Go build (Step 1 verify) prints `GO_BUILD_OK`
- [ ] `grep -c "bun-version: latest" .github/workflows/*.yml` → 0 for every file
- [ ] `bun run test:e2e` passes after `rm -rf dist`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The Go build still fails after Step 1 for a reason other than the embed pattern.
- `bun run test` has failures that are not the three timing tests.
- Playwright fails for reasons unrelated to the missing build (report the failing spec).

## Maintenance notes

- If `go:embed` ever moves, keep a tracked placeholder in the embedded directory.
- Reviewers: check that the `.gitignore` negation does not un-ignore the real built assets (`git status` after `make build` must stay clean).
- Deferred: Biome schema bump (`biome migrate`), covered by no plan; do it as a chore.
