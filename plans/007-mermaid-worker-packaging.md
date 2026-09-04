# Plan 007: Ship the Mermaid worker in the CLI bundle and stop the CLI from depending on client-only packages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/lib/mermaid-renderer.ts src/lib/mermaid-worker.ts src/lib/utils.ts package.json src/cli.ts src/server.ts src/zed-lsp.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001
- **Category**: bug / perf
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/29

## Why this matters

Server-side Mermaid rendering is a shipped feature (roadmap v0.4.0). In the published npm package it cannot work: the built CLI still contains the literal `new URL("./mermaid-worker.ts", import.meta.url)` and `dist/` contains no `mermaid-worker.*`. Reproduced on 2026-09-04: resolving that URL from `dist/index.js` and constructing a `Worker` fails with `ModuleNotFound resolving ".../dist/mermaid-worker.ts"`. Every diagram then falls back to client rendering after a failed spawn, while `mermaid` (~83 MB) and `jsdom` (~5 MB) are installed for nothing. In the same build, `dist/index.js` imports `clsx` and `tailwind-merge` because `isMarkdownFile` shares `src/lib/utils.ts` with the Tailwind `cn()` helper, and `lucide-svelte` is a runtime dependency used only by Svelte components.

## Current state

- `src/lib/mermaid-renderer.ts:32-35`:
```ts
function createWorker(): { worker: Worker; ready: Promise<void> } {
  const w = new Worker(new URL("./mermaid-worker.ts", import.meta.url).href, {
    type: "module",
  });
```
Startup failure path: `onStartupError` (lines 49-59) rejects; `ensureWorker` (lines 96-113) recreates on the next call; `renderMermaidBlocks` (lines ~246-256) catches and returns `null` per block so `replaceMermaidBlocks` in `markdown-renderer.ts:215-233` leaves the `<pre><code class="language-mermaid">` for the client (`src/components/DocumentViewer.svelte:118`).
- `src/lib/mermaid-worker.ts` — module-level `new JSDOM(...)`, `await import("mermaid")`, `postMessage({type:"ready"})` protocol.
- `package.json:31` `"build:cli": "NODE_ENV=production bun build src/cli.ts --outfile dist/index.js --target bun --format esm --packages external"`. Bun's bundler does not rewrite `new URL(..., import.meta.url)` worker references in this configuration; `dist/` after `bun run build` contains `assets/ index.html index.js` only.
- `src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function isMarkdownFile(filePath: string): boolean { return filePath.endsWith(".md") || filePath.endsWith(".markdown"); }
export function cn(...inputs: ReadonlyArray<ClassValue>) { return twMerge(clsx(inputs)); }
export function truncate(text: string, maxLength = 30): string { … }
```
Imported by `src/cli.ts:20`, `src/server.ts:24`, `src/zed-lsp.ts:4` (for `isMarkdownFile`) and by many `.svelte` files (for `cn`). `dist/index.js:396-397` shows `import { clsx } from "clsx"; import { twMerge } from "tailwind-merge";`.
- `package.json` `dependencies`: clsx, commander, lucide-svelte, markdown-it, mermaid, open, jsdom, shiki, tailwind-merge. `files`: `["dist", "shell"]`.
- Existing tests: `src/lib/markdown-renderer.test.ts` has a mermaid case (search for `language-mermaid`).

Conventions: conventional commits `fix(build): …`, `chore(deps): …`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build | `bun run build` | `dist/index.js` and `dist/mermaid-worker.js` exist |
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test` | all pass |
| Lint | `bun run check` | exit 0 |
| Smoke | see Step 3 | `<svg` in output |

## Scope

**In scope**:
- `package.json` (`build:cli` script, dependency sections)
- `src/lib/mermaid-renderer.ts` (worker URL resolution)
- `src/lib/utils.ts` → split into `src/lib/utils.ts` (Node-safe) and `src/lib/cn.ts`; update the `.svelte` importers of `cn`/`truncate` (mechanical import path change only)
- `scripts/smoke-mermaid.ts` (create) and a `smoke` script in `package.json`
- `bun.lock`

**Out of scope**:
- Mermaid render concurrency or MarkdownIt instance hoisting (perf nice-to-haves; not this plan).
- Making mermaid/jsdom optional dependencies (decide after this plan proves the worker loads).

## Git workflow

- Branch: `advisor/007-mermaid-worker-packaging`
- Commits: `fix(build): emit the mermaid worker next to the CLI bundle`, `chore(deps): move client-only packages out of the CLI's runtime deps`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Emit the worker as a second build entry

Change `build:cli` in `package.json` to:
```json
"build:cli": "NODE_ENV=production bun build src/cli.ts src/lib/mermaid-worker.ts --outdir dist --target bun --format esm --packages external --entry-naming [name].js",
```
and rename the produced `dist/cli.js` to `dist/index.js` (or set `"bin": {"readit": "./dist/cli.js"}` and `"main"` accordingly — prefer keeping `dist/index.js` to avoid touching `e2e/utils/cli.ts:16`; add `&& mv dist/cli.js dist/index.js`).

**Verify**: `bun run build && ls dist` → includes `index.js` and `mermaid-worker.js`.

### Step 2: Resolve the worker path for both dev and built runs

In `src/lib/mermaid-renderer.ts` replace the URL construction with:
```ts
function workerUrl(): string {
  // Built: dist/mermaid-worker.js beside dist/index.js. Dev: the .ts source.
  const built = new URL("./mermaid-worker.js", import.meta.url);
  const dev = new URL("./mermaid-worker.ts", import.meta.url);
  return Bun.file(built).size > 0 ? built.href : dev.href;
}
```
(`Bun.file(url).size` is 0 for a missing file.) Use `workerUrl()` in `createWorker`.

**Verify**: `bun run typecheck` → exit 0. `bun run test` → all pass (dev path unchanged).

### Step 3: Smoke test the built bundle

Create `scripts/smoke-mermaid.ts`:
```ts
// Renders one mermaid fence through the *built* renderer and asserts SVG output.
const { renderMarkdown } = await import("../dist/index.js").catch(() => ({ renderMarkdown: undefined }));
```
`dist/index.js` is a CLI entry and does not export `renderMarkdown`, so instead build a tiny second entry: add `src/lib/render-entry.ts` exporting `renderMarkdown`, include it in `build:cli` entries, and have the smoke script import `../dist/render-entry.js`, call `renderMarkdown("```mermaid\ngraph TD; A-->B\n```\n")`, and `process.exit(html.includes("<svg") ? 0 : 1)` after `disposeMermaidWorker()`. Add `"smoke": "bun run build && bun scripts/smoke-mermaid.ts"` to `package.json` and run it in the CI `frontend` job after `bun run test`.

**Verify**: `bun run smoke` → exit 0 within ~30 s. Also confirm the negative: temporarily `mv dist/mermaid-worker.js /tmp/x && bun scripts/smoke-mermaid.ts; echo $?` → non-zero, then move it back.

### Step 4: Split `utils.ts` so the CLI stops importing Tailwind helpers

1. Create `src/lib/cn.ts` containing `cn` and `truncate` (both UI-only) with the `clsx`/`tailwind-merge` imports.
2. Leave `isMarkdownFile` alone in `src/lib/utils.ts` and remove the two imports there.
3. Update every importer: `grep -rln "from \"\$lib/utils\"\|from \"./lib/utils\|from \"../lib/utils\|lib/utils\"" src` — Svelte files importing `cn`/`truncate` switch to `cn.ts`; `cli.ts`, `server.ts`, `zed-lsp.ts` stay on `utils.ts`.
4. `package.json`: move `clsx`, `tailwind-merge`, `lucide-svelte` from `dependencies` to `devDependencies` (they are bundled by Vite into `dist/assets`). Keep `mermaid` and `jsdom` in `dependencies` — after Step 1 they are genuinely loaded at runtime by the worker.
5. Add a guard to `build:cli`: `&& ! grep -q 'from "clsx"' dist/index.js` (fails the build if the CLI bundle regresses).

**Verify**: `bun install && bun run build` → exit 0; `grep -c 'from "clsx"\|from "tailwind-merge"\|lucide' dist/index.js` → 0. `bun run typecheck && bun run test && bun run check` → exit 0. `bun run build` still produces working `dist/assets` (`bun run test:e2e` → pass).

## Test plan

- `scripts/smoke-mermaid.ts` is the regression test for the packaging bug; wire it into CI.
- Existing `markdown-renderer.test.ts` mermaid case continues to cover the dev path.

## Done criteria

- [ ] `ls dist` shows `mermaid-worker.js`
- [ ] `bun run smoke` exits 0
- [ ] `grep -c 'from "clsx"\|from "tailwind-merge"' dist/index.js` → 0
- [ ] `clsx`, `tailwind-merge`, `lucide-svelte` are under `devDependencies`
- [ ] `bun run typecheck`, `bun run test`, `bun run check`, `bun run test:e2e` exit 0
- [ ] `.github/workflows/ci.yml` frontend job runs `bun run smoke`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `bun build` with two entries cannot preserve the `dist/index.js` name and `e2e/utils/cli.ts` would need to change (report; do not edit e2e).
- The worker starts but mermaid fails inside jsdom in the built bundle (report the error; that is a different bug).

## Maintenance notes

- Any future `new Worker(...)` needs an entry in `build:cli` and the same size-probe fallback.
- Reviewers: check `npm pack --dry-run` output lists `dist/mermaid-worker.js`.
- Deferred: making the Mermaid worker an optional dependency to cut install size.
