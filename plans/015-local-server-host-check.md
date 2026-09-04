# Plan 015: Reject cross-origin and non-loopback `Host` requests on the local servers

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/server.ts go/internal/server/server.go go/internal/server/documents.go vite.config.ts src/lib/client.ts vscode-readit/src zed-readit nvim-readit`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (MED for editor integrations — see Step 1)
- **Depends on**: 001, 013
- **Category**: security
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/37

## Why this matters

The local server dispatches on path and method only. `POST /api/documents` accepts any absolute path, canonicalizes it, and adds it to the served set; `GET /api/document?path=` then returns its rendered content. Trusting *localhost callers* is the documented tradeoff for a dev tool, but DNS rebinding turns a visited web page into a localhost caller: a page whose DNS flips to `127.0.0.1` can `fetch("http://attacker.example:4567/api/documents", …)` and read any Markdown on the machine or delete review comments. Vite added `server.allowedHosts` for the same reason. Checking `Host` (loopback or the bound host) and `Origin` (absent or same-origin on state-changing methods) closes it in a few lines per server.

## Current state

- `src/server.ts` ~964: `Bun.serve({ port: options.port, hostname: options.host, idleTimeout: 255, async fetch(req) { const url = new URL(req.url); const { pathname } = url; const method = req.method; … } })`. No `Host`/`Origin` handling anywhere (`grep -n -i '"host"\|origin' src/server.ts` → only `options.host` and the Vite dev origin).
- `POST /api/documents` ~985-1030: `canonicalizePath(requestedPath)` → `isMarkdownFile` → add + watch + SSE `document-added`.
- `--host 0.0.0.0` is documented for LAN use; `writeServerInfo({ port, pid, host: options.host })` records it and `serverHost()` in `src/lib/readit-home.ts` maps wildcard hosts to `127.0.0.1` for clients.
- Clients: the browser (same origin, via `src/lib/client.ts`), `vscode-readit/src/*`, `zed-readit` + `src/zed-lsp.ts`, `nvim-readit/lua/readit/init.lua`, `shell/` — all dial `serverUrl(info)` = `http://127.0.0.1:<port>` (or the recorded non-wildcard host) and send no `Origin`.
- Vite dev: `vite.config.ts` proxies `/api` to `http://localhost:4567` with `changeOrigin: true` → the Bun server sees `Host: localhost:4567`.
- Go: `go/internal/server/server.go:124-154` `registerRoutes` on `http.ServeMux`; `documents.go:31-72` `addDocument`.
- Tests: `test/contract/bun-only.test.ts` (plan 013) spawns the real Bun server; Node's `fetch` (undici) may refuse to override `Host` — use `node:http` `request()` with an explicit `headers: { host: "evil.example" }` for that case.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Bun-only tests | `bun run build && bun run test:contract` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Go tests | `make test` | `ok` |
| e2e | `bun run test:e2e` | all pass |

## Scope

**In scope**:
- `src/server.ts` (one guard at the top of `fetch`; a small exported pure function `isAllowedRequest`)
- `src/server.test.ts` (create; unit-tests the pure function) — or put it in `src/lib/request-guard.ts` + test
- `go/internal/server/server.go` (middleware) + `server_test.go` (create/extend)
- `test/contract/bun-only.test.ts` (two integration cases)
- `README.md` (one sentence under Usage)

**Out of scope**:
- Token auth for the local API. The Worker (public by design).

## Git workflow

- Branch: `advisor/015-host-check`
- Commits: `fix(server): reject non-loopback Host and cross-origin state changes`, `fix(go): same host and origin guard`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm what clients send

`grep -rn "fetch(\|curl\|http://" vscode-readit/src zed-readit/src src/zed-lsp.ts nvim-readit/lua shell src/lib/client.ts | grep -v test` — confirm every URL host is loopback or `serverUrl(info)` and no client sets `Origin`. Record findings.

### Step 2: Pure guard + Bun wiring

Create `src/lib/request-guard.ts`:
```ts
export function isAllowedRequest(headers: Headers, method: string, boundHost: string): boolean {
  const allowed = new Set(["127.0.0.1", "localhost", "::1", boundHost]);
  const hostname = (headers.get("host") ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (boundHost === "0.0.0.0" || boundHost === "::") { if (!hostname) return false; }   // LAN mode: any non-empty host; Origin still checked
  else if (!allowed.has(hostname)) return false;
  const origin = headers.get("origin");
  if (!origin || method === "GET" || method === "HEAD") return true;
  try { const o = new URL(origin); return allowed.has(o.hostname.replace(/^\[|\]$/g, "")) || (boundHost === "0.0.0.0" && o.hostname === hostname); } catch { return false; }
}
```
In `createServer`'s `fetch`, first line: `if (!isAllowedRequest(req.headers, method, options.host)) return errorResponse("Forbidden host or origin", 403);`.

`src/lib/request-guard.test.ts`: loopback host → allowed; `evil.example` → denied; `Origin: http://evil.example` on `POST` → denied; same-origin `Origin: http://127.0.0.1:4567` → allowed; `GET` with foreign Origin → allowed; bound `0.0.0.0` with `Host: 192.168.1.5:4567` → allowed.

**Verify**: `bun run test -- request-guard` → 6 pass; `bun run typecheck` → exit 0; `bun run test:e2e` → green; `bun dev` still serves through the Vite proxy (open the page once).

### Step 3: Integration cases

In `test/contract/bun-only.test.ts`: (a) `node:http` request with `headers: { host: "evil.example" }` to `/api/documents` → 403; (b) `POST /api/comments` with `origin: http://evil.example` → 403.

**Verify**: `bun run test:contract` → pass.

### Step 4: Go

Middleware wrapping the mux with the same rule; `httptest` cases for the two denials in `server_test.go`.

**Verify**: `make test` → `ok`.

### Step 5: README

Under Usage after `--host`: "Requests must arrive with a loopback `Host` (or the bound host when using `--host`); this blocks DNS-rebinding from web pages."

## Done criteria

- [ ] `bun run test`, `bun run test:contract`, `make test`, `bun run test:e2e` exit 0
- [ ] `curl -s -o /dev/null -w '%{http_code}' -H 'Host: evil.example' http://127.0.0.1:<port>/api/documents` → `403`; without the header → `200`
- [ ] README sentence present
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Step 1 finds an integration sending a non-loopback host or an `Origin` (report before choosing the allowlist).
- Vite dev mode breaks (report the observed `Host`).

## Maintenance notes

- Reviewers: test `--host 0.0.0.0` from another LAN device once.
