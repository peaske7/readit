# Plan 004: Worker test harness — SUPERSEDED (landed independently)

> **Executor instructions**: Nothing to execute. This plan is kept so the
> numbering in `plans/README.md` stays stable and so the executor of plan 005
> knows what already exists.

## Status

- **Priority**: P1
- **Effort**: —
- **Risk**: —
- **Depends on**: —
- **Category**: tests
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Status**: SUPERSEDED — the harness landed in commit `0931470`/`e1d90dd` (merged as `6ba758c`) while this plan was being written.

## What exists now

- `worker/vitest.config.ts` — `@cloudflare/vitest-pool-workers` with miniflare `r2Buckets: ["SHARES"]`, bindings `PUBLISH_TOKEN`/`COOKIE_SECRET` set inline (not read from `wrangler.toml`), `globalSetup: ./test/manifest-setup.ts` (stubs `src/manifest.json` when there has been no build).
- `worker/test/helpers.ts` — `fetchWorker(path, init)` calls `worker.fetch` directly with a `testEnv` that stubs `ASSETS` and `UNLOCK_LIMITER` (`limit: async () => ({ success: true })`); `PUBLISHER` auth header; `createShare`, `putSnapshot`, `publishShare`; fixtures `SOURCE`, `HTML`.
- `worker/test/publish.test.ts` — 12 cases: 401 without token, create, fileName required, snapshot + list, 400 on missing fields, 404 unknown id, raw comments for pull, PATCH mode, password required, asset upload + HEAD, asset name regex, delete.
- `worker/test/view.test.ts` — 11 cases: document route, page + noindex, 404s, comment create/list/raw-for-pull, 400 on missing fields, edit + delete, raw to viewer, password gating, wrong password, unlock sets cookie, password change invalidates cookies.
- Scripts: `bun run test:worker` (`cd worker && vitest run`); CI `worker` job runs it.

## What this plan asked for that is still missing

These are now owned by **plan 005** (it writes them as `it.fails` first, then flips them):

1. Two concurrent `POST /s/{id}/api/comments` both persist.
2. A 100 000-character comment body is rejected with 413.
3. Bulk `DELETE /s/{id}/api/comments` without the publisher token is rejected.

And by **plan 003**: asset content-type pinning, 411 without `content-length`, SVG `content-disposition`.

And by **plan 006**: `worker/test/headers.test.ts` for CSP/nosniff/frame headers.

## Done criteria

- [ ] `plans/README.md` row for 004 reads `SUPERSEDED (harness landed in 6ba758c; gaps moved to 003/005/006)`
