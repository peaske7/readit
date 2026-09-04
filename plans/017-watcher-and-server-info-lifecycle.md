# Plan 017: Fix duplicate file watchers, `server.json` ownership, and the browser-open heuristic

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/server.ts src/cli.ts src/lib/readit-home.ts src/lib/readit-home.test.ts go/cmd/readit/main.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001, 013
- **Category**: bug
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/39

## Why this matters

Three lifecycle defects. (1) Rename-style saves (Vim, Neovim, Emacs) trigger `rewatch`, which polls up to 2 s; a second rename in that window re-enters `rewatch`, finds the original watcher already replaced (`indexOf === -1`), and **pushes** another watcher, so watchers accumulate and each save fans out N `document-updated` events. (2) `~/.readit/server.json` has no ownership: the default `readit <file>` command bypasses the server lock that `open`/`zed-open` use, overwrites `server.json` with its own pid, and on Ctrl+C deletes it even if another server is still running; the "browser tab closed" shutdown exits **without** removing it. (3) The browser-open heuristic reads the leftover file: `previousPort` is set only when the recorded pid is dead and the browser is *not* opened when it equals the preferred port — so after a normal tab-close exit the next `readit doc.md` opens nothing, and after Ctrl+C it opens a duplicate.

## Current state

- `src/server.ts`:
  - `onHeartbeatClose` ~675-687: 1.5 s after the last heartbeat client leaves → `process.exit(0)` with no `removeServerInfo()`.
  - `watchFile` ~869-915 and `rewatch` ~917-953: `const idx = watchers.indexOf(watcher); … if (idx >= 0) watchers[idx] = newWatcher; else watchers.push(newWatcher);`. `watchers` is an array (`watchers.push` at ~1029 and ~1253); `server.stop()` closes all.
  - `startServer` ~1290: `await writeServerInfo({ port: actualPort, pid: process.pid, host: options.host })`.
- `src/lib/readit-home.ts:96-118`: `readServerInfo()`, `writeServerInfo(info)`, `removeServerInfo()` (unconditional unlink). `ServerInfo = { port, pid, host? }`. Tests in `src/lib/readit-home.test.ts` with fixture `src/lib/__fixtures__/server-info.json` (shared with Go's `go/cmd/readit/server_info_test.go`).
- `src/cli.ts`:
  - default action (~790-895): `const previous = await readServerInfo(); const previousPort = previous && !isAlive(previous.pid) ? previous.port : undefined;` (~839-841); `startServer` directly (not via `withServerLock`); `browserLikelyOpen = previousPort === preferredPort || NODE_ENV === "development"` (~876-880); SIGINT → `server.stop(); await removeServerInfo(); exit(0)`.
  - `open` (~985-1010) uses `getServerTarget` → `withServerLock` → `discoverServer` (`readServerInfo` + `isAlive` + `/api/health`) and `attachFiles(target.info, files)` when `kind === "existing"`.
- Go `go/cmd/readit/main.go`: `writeServerInfo(port, host)`, `removeServerInfo()` unconditional; `resolvedHost()` mirrors `serverHost()`.
- `test/contract/bun-only.test.ts` (plan 013) has an `it.fails` watcher case and a `server.json` contents case.

Conventions: style guide §3.3 guard clauses; keep `server.ts` edits minimal.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bun run test -- readit-home` | all pass |
| Bun-only tests | `bun run build && bun run test:contract` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Go tests | `make test` | `ok` |
| e2e | `bun run test:e2e` | all pass |

## Scope

**In scope**:
- `src/server.ts` (`watchFile`/`rewatch`, `onHeartbeatClose`)
- `src/lib/readit-home.ts` (`removeServerInfo` ownership), `src/lib/readit-home.test.ts`
- `src/cli.ts` (default action)
- `go/cmd/readit/main.go` (`removeServerInfo` ownership) + `server_info_test.go`
- `test/contract/bun-only.test.ts` (flip `it.fails`)

**Out of scope**:
- Splitting `server.ts`/`cli.ts`. Go fsnotify watcher.

## Git workflow

- Branch: `advisor/017-watcher-lifecycle`
- Commits: `fix(server): one watcher per file across rename-saves`, `fix(home): server.json is removed only by the pid that wrote it`, `fix(cli): attach to a running server and open the browser on a live signal`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Watchers keyed by path, one rewatch in flight

- `const watchers = new Map<string, FSWatcher>()`; `watchFile` callers do `watchers.set(fp, w)`; `server.stop()` iterates `watchers.values()`.
- `FileState.rewatching?: boolean`; in `rewatch`: `if (state.rewatching) return; state.rewatching = true; try { … } finally { state.rewatching = false; }`; close `watchers.get(filePath)` and `watchers.set(filePath, newWatcher)`.

**Verify**: `bun run typecheck` → exit 0. Manual: Neovim `:w` ×5 quickly → one `File changed:` per save. Flip the plan-013 watcher case to `it(` if it is automated; `bun run test:contract` → pass.

### Step 2: `server.json` ownership

- `src/lib/readit-home.ts` `removeServerInfo()`: read first; unlink only if `info.pid === process.pid` or the file is unreadable. Add tests in `readit-home.test.ts`: file written by another pid survives; own file is removed.
- `src/server.ts` heartbeat shutdown: `await removeServerInfo(); process.exit(0)` (async timer callback).
- Go `removeServerInfo()`: same ownership check; extend `server_info_test.go`.

**Verify**: `bun run test -- readit-home` → pass; `make test` → `ok`.

### Step 3: Default command attaches to a running server

Route the default action through `getServerTarget(files, preferredPort, options.host)`. `kind === "existing"` → `attachFiles(target.info, files)`, print `target.url`, `open(url)` unless `--no-open`, exit 0 with no SIGINT handler. `kind === "started"` → as today. Delete the `previous`/`previousPort` lines and `browserLikelyOpen`; open the browser when `options.open && kind === "started"` and `NODE_ENV !== "development"`, or when files were attached to an existing server.

**Verify**: `bun run typecheck` → exit 0. Manual: terminal A `bun src/cli.ts a.md --no-open --port 4599`; terminal B `bun src/cli.ts b.md --no-open --port 4599` → B prints A's URL and exits; `curl localhost:4599/api/documents` lists both; `cat ~/.readit/server.json` still has A's pid. Kill A → file gone.

### Step 4: e2e

`bun run test:e2e` → all pass (stop any real server on 4567 first).

## Done criteria

- [ ] `grep -n "watchers.push\|watchers.indexOf" src/server.ts` → no matches
- [ ] `grep -n "previousPort\|browserLikelyOpen" src/cli.ts` → no matches
- [ ] `grep -n "removeServerInfo" src/server.ts` shows the heartbeat shutdown path calling it
- [ ] `bun run test`, `bun run test:contract`, `make test`, `bun run typecheck`, `bun run test:e2e` exit 0
- [ ] Manual two-terminal scenario recorded in the report
- [ ] `plans/README.md` status row updated

## STOP conditions

- `attachFiles`/`getServerTarget` cannot be reused without changing `open`'s behavior.
- Plan 013's file does not exist (stop; dependency).

## Maintenance notes

- Reviewers: check the Zed and VS Code integrations still discover the server (they read `server.json` via `readServerInfo`/`resolvedHost`).
