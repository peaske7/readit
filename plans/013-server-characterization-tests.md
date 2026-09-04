# Plan 013: Bun-only server tests on top of the contract suite

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- test/contract vitest.contract.config.ts src/server.ts package.json .github/workflows/ci.yml`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: 001
- **Category**: tests
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/35

## Why this matters

Commit `6ba758c` added `test/contract/`: one route-shape suite run against real Bun, Go, and Worker processes with an isolated `HOME`, documented in `docs/api-contract.md`. That covers the cross-server *contract*. What it deliberately does not cover are Bun-server-specific behaviors that plans 010, 015, and 017 change: the SSR page cache, concurrent comment writes, static-file traversal, `server.json` contents, corrupt-settings tolerance, and the rename-save watcher. This plan adds a Bun-only file that reuses the contract suite's spawn helpers so those fixes land with tests instead of manual checks.

## Current state

- `vitest.contract.config.ts`: `environment: "node"`, `include: ["test/contract/**/*.test.ts"]`, `testTimeout: 30_000`, `hookTimeout: 120_000`, `fileParallelism: false`. Script `bun run test:contract`. CI job `contract` builds then runs it (Go and Worker adapters skip there).
- `test/contract/adapters.ts`: `bunAdapter()` returns `{ name, omits, start }` or a `skipReason` when `dist/index.js` is missing; `start()` creates a workspace (`mkdtemp` with `home/`, `contract.md`, `second.md`), picks a free port, spawns `bun dist/index.js <doc> --no-open --port <p>` with `env: { ...process.env, HOME: workspace.home, NODE_ENV: "production" }`, waits for `/api/health`, returns `{ apiBase, addableDocumentPath, stop }`. (`HOME` isolation works because `readitHome()` derives from `os.homedir()`; `READIT_HOME` would also work.)
- `test/contract/spawn.ts`: `freePort()`, `startServerProcess()`, `waitForOk()`.
- `test/contract/contract.ts`: `runContract(adapter)`; helpers `send`, `createComment`, `expectComment`, `expectSettings`; `beforeEach` clears comments.
- `test/contract/fixture.ts`: `FIXTURE_MARKDOWN`, `SECOND_MARKDOWN`, `FIXTURE_HTML`, `FIXTURE_HEADINGS`.
- `src/server.ts`: page cache only in production mode (check the `isDev` gating near `serveAppPage`, ~770-830); `writeServerInfo({ port, pid, host })` at ~1290; static files served under `/assets/` (find `serveStaticFile`, ~535-555); heartbeat auto-exit 1.5 s after the last heartbeat client disconnects — **never open `/api/heartbeat` in tests**.

Conventions: Vitest; conventional commit `test(server): …`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Build | `bun run build` | `dist/index.js` exists |
| Contract + Bun-only | `bun run test:contract` | all pass (Go/Worker adapters skipped unless built) |
| Typecheck | `bun run typecheck` | exit 0 (tsconfig includes `test/`) |

## Scope

**In scope**:
- `test/contract/bun-only.test.ts` (create)
- `test/contract/adapters.ts` — only if a helper needs exporting (e.g. `createWorkspace`); no behavior change
- `docs/api-contract.md` — one sentence pointing at the Bun-only file

**Out of scope**:
- Fixing any behavior. Tests for known bugs (plans 010, 017) are written for the *intended* behavior and marked `it.fails` with the plan number in the name.
- `src/server.ts`.

## Git workflow

- Branch: `advisor/013-bun-only-server-tests`
- Commit: `test(server): Bun-only cases on the contract harness`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Harness

```ts
// test/contract/bun-only.test.ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bunAdapter } from "./adapters";
import type { ContractServer } from "./contract";

const adapter = bunAdapter();
describe.skipIf(!adapter.start)("bun-only", () => {
  let server: ContractServer;
  beforeAll(async () => { server = await adapter.start!(); }, 120_000);
  afterAll(async () => { await server?.stop(); });
  const api = (p: string, init?: RequestInit) => fetch(`${server.apiBase}${p}`, init);
  …
});
```
Expose the workspace `home` from `startLocalServer` by adding `home` to `ContractServer` (optional field) so tests can read `server.json`/`settings.json` under it.

**Verify**: `bun run build && bun run test:contract` → the new describe runs (not skipped) and a first trivial case passes.

### Step 2: Cases

1. `GET /` → 200; body contains `id="document-content"` and a `<script type="application/json" id="__readit">` whose JSON parses with `activeFile` equal to the fixture path.
2. `it.fails("GET / after PUT /api/settings reflects the new font (plan 010)")`: PUT `{fontFamily:"sans-serif"}` then GET `/` → inline `settings.fontFamily === "sans-serif"`.
3. Concurrency: `Promise.all` of two `POST /api/comments` → `GET` lists 2 (documents `withCommentLock`).
4. `GET /assets/../../etc/passwd` and `GET /assets/..%2f..%2fetc%2fpasswd` → 404.
5. `POST /api/documents` with a `.txt` path → 400; with a nonexistent path → 404.
6. `server.json` under `home/.readit/` has `{ port, pid, host }` with `port === <spawned port>`.
7. `it.fails("corrupt settings.json still serves the page (plan 010)")`: write `garbage` to `home/.readit/settings.json`, GET `/` → 200. Restore afterwards.
8. `it.fails("rename-save keeps one watcher (plan 017)")`: open `GET /api/document/stream` (SSE; read with a timeout via `res.body.getReader()`), then `rename(doc, doc+".tmp")`+`rename` back twice 50 ms apart; expect exactly one `document-updated` per save within 3 s. If SSE parsing is too brittle, replace with a comment in the file listing this as manual (plan 017 then verifies manually) — say so in your report.

**Verify**: `bun run test:contract` → all pass with three expected failures.

### Step 3: Docs

Append to `docs/api-contract.md`: "Bun-only behaviors (page cache, watcher, `server.json`) are covered in `test/contract/bun-only.test.ts`, which reuses the same spawn helpers."

## Test plan

This plan is the test plan (8 cases).

## Done criteria

- [ ] `bun run test:contract` exits 0; output shows `bun-only` with ≥ 8 tests, 3 marked expected-failure
- [ ] `grep -c "it.fails(" test/contract/bun-only.test.ts` → 3
- [ ] `git diff --stat 6ba758c -- src/server.ts` empty
- [ ] `plans/README.md` status row updated

## STOP conditions

- `bunAdapter().start` cannot be reused without changing `contract.ts` semantics (report the coupling).
- Node's `fetch` cannot read the SSE stream incrementally (case 8 → manual note).

## Maintenance notes

- Plans 010 and 017 flip the `it.fails` cases here as part of their done criteria.
- Never touch `/api/heartbeat` from tests.
