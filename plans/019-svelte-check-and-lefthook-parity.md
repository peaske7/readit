# Plan 019: Typecheck Svelte components and make pre-commit run what CI runs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- package.json lefthook.yml tsconfig.json svelte.config.js .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (the first run will surface a backlog)
- **Depends on**: 001
- **Category**: dx
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/41

## Why this matters

`bun run typecheck` is `tsc --noEmit`, which never reads `.svelte` files. Thirty-one components plus `App.svelte` (975 lines) have no static type checking anywhere, locally or in CI; prop and type mistakes are caught only by four Playwright specs. Separately, the pre-commit hook lints only `*.{ts,tsx,json}`, so Svelte/CSS/Markdown formatting violations pass locally and fail in CI minutes later.

## Current state

- `package.json:44` `"typecheck": "tsc --noEmit"`; no `svelte-check` in `devDependencies` (`ls node_modules/.bin | grep svelte-check` → nothing).
- `tsconfig.json`: `include: ["src"]`, `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `types: ["node"]`, `lib` includes DOM. `svelte.config.js` exists (116 bytes; read it — it likely sets `vitePreprocess`).
- `lefthook.yml`:
```yaml
pre-commit:
  parallel: true
  commands:
    check:
      glob: "*.{ts,tsx,json}"
      run: bunx biome check --no-errors-on-unmatched {staged_files}
    typecheck:
      run: bun run typecheck
```
- CI `frontend` job runs `bun run check` (all files), `bun run typecheck`, `bun run test`.
- `biome.json` has a Svelte override disabling unused-import/variable rules for `.svelte`.
- Svelte 5.57, `@sveltejs/vite-plugin-svelte` 5.1, TypeScript 5.9.

Conventions: conventional commits `chore(dx): …`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun add -d svelte-check` | exit 0 |
| Svelte typecheck | `bun run typecheck:svelte` | exit 0 (after backlog triage) |
| Lint | `bun run check` | exit 0 |
| Existing typecheck | `bun run typecheck` | exit 0 |

## Scope

**In scope**:
- `package.json` (devDependency, scripts `typecheck:svelte`, and make `typecheck` run both)
- `lefthook.yml`
- `.github/workflows/ci.yml` (frontend job)
- `src/**/*.svelte` — **only** minimal type annotations or fixes needed to make `svelte-check` pass; no behavior changes, no refactors

**Out of scope**:
- Biome rule changes.
- Any component logic change. If a `svelte-check` error reveals a real bug, record it in your report and fix only if the fix is a type annotation; otherwise leave it and list it.

## Git workflow

- Branch: `advisor/019-svelte-check`
- Commits: `chore(dx): add svelte-check`, `fix(ui): type errors surfaced by svelte-check`, `chore(dx): pre-commit lints every file type CI lints`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Install and run once

`bun add -d svelte-check`. Add scripts: `"typecheck:svelte": "svelte-check --tsconfig ./tsconfig.json --threshold error"` and change `"typecheck"` to `"tsc --noEmit && bun run typecheck:svelte"`. Run `bun run typecheck:svelte` and save the output to your report. Count errors and warnings.

**Verify**: the command runs to completion (exit code may be non-zero); note the counts.

### Step 2: Triage the backlog

Categorize errors: (a) missing prop types / `$props()` generics, (b) `any` leaks from stores, (c) DOM typing (`event.target` narrowing), (d) genuine bugs. Fix (a)-(c) with annotations only. For (d), list them in the report with file:line and do not change behavior. If the backlog exceeds ~40 errors, add `--threshold error` is already set; consider `// @ts-expect-error <reason>` for at most a handful of hard cases and list each.

**Verify**: `bun run typecheck:svelte` → exit 0. `bun run test:e2e` → all pass (no behavior changed).

### Step 3: Lefthook parity

```yaml
pre-commit:
  parallel: true
  commands:
    check:
      glob: "*.{ts,tsx,js,json,svelte,css,md}"
      run: bunx biome check --no-errors-on-unmatched {staged_files}
    typecheck:
      run: bun run typecheck
```
(`bun run typecheck` now includes svelte-check; if it is too slow for pre-commit — measure — keep `tsc` in the hook and run `typecheck:svelte` only in CI, and say so in the report.)

**Verify**: stage a `.svelte` file with a deliberate formatting error, `bunx lefthook run pre-commit` → fails; fix and rerun → passes.

### Step 4: CI

`ci.yml` frontend job already runs `bun run typecheck`; since that now includes svelte-check, nothing else to add. Confirm.

## Test plan

No new tests. e2e regression run in Step 2.

## Done criteria

- [ ] `bun run typecheck` exits 0 and runs svelte-check (`grep -n "typecheck:svelte" package.json` → 2 matches)
- [ ] `lefthook.yml` glob includes `svelte` and `css`
- [ ] `bun run check`, `bun run test`, `bun run test:e2e` exit 0
- [ ] Report lists every `@ts-expect-error` added (target: 0–5) and every suspected real bug found
- [ ] No behavior changes (`git diff 6ba758c -- src | grep -v "^[-+].*:" | head` shows only type annotations — reviewer judgment)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `svelte-check` fails to run with the installed Svelte/Vite plugin versions (report versions).
- Backlog exceeds ~80 errors (report the categorized counts and stop; the operator decides whether to gate CI on it).

## Maintenance notes

- New components must pass `svelte-check`; the pre-commit hook enforces formatting, CI enforces types.
- Reviewers: skim the annotation diff for `as any` — none should be introduced.
