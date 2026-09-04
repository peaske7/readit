# Plan 010: Invalidate the page cache on settings and document changes, and survive a corrupt `settings.json`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/server.ts src/lib/readit-home.ts src/lib/readit-home.test.ts go/internal/server/settings.go go/internal/server/types.go`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (013 recommended first for the Bun-only regression test)
- **Category**: bug
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/32

## Why this matters

The local server caches the fully rendered page (with settings and the file list embedded) per document. Every comment route clears that cache; the settings route and the "add document" route do not. In production mode a font or keybinding change appears to revert on reload, and `readit open other.md` adds a tab that vanishes on the next reload. Separately, `readSettings` does `JSON.parse(content) as Settings` with only `ENOENT` handled, so a torn or hand-edited `~/.readit/settings.json` turns every page load into a bare 500. The Go server drops unknown keys (including `onboarded`, which the CLI writes) when it rewrites settings, and accepts unknown shortcut ids that the Bun server rejects. (`markOnboarded` is now atomic via `writeSettings` since `6ba758c`; that part of the original finding is closed.)

## Current state

- `src/server.ts`: `invalidatePageCache()` defined at line ~761 inside `createServer`; called at ~901, ~942 (file change / rewatch), ~1143, ~1150, ~1158 (comment routes), ~1205 (share route). Not called from the settings route nor from the `POST /api/documents` "added" branch (~985-1030, after `fileOrder.push(filePath)`). The dispatcher calls module-level `updateSettingsRoute(req)` (~430-460), which wraps `readSettings`/`writeSettings` in `withSettingsLock(settingsPath(), …)`.
- `src/lib/readit-home.ts:80-94`:
```ts
export async function readSettings(): Promise<Settings> {
  try { const content = await fs.readFile(settingsPath(), "utf-8"); return JSON.parse(content) as Settings; }
  catch (err) { if (isErrnoException(err) && err.code === "ENOENT") return DEFAULT_SETTINGS; throw err; }
}
export async function writeSettings(settings: Settings): Promise<void> { await writeAtomic(settingsPath(), JSON.stringify(settings, null, 2)); }
```
`Settings = DocumentSettings` (`version`, `fontFamily`, `keybindings?`). `src/cli.ts` `markOnboarded` writes `{ ...DEFAULT_SETTINGS, ...settings, onboarded: true }` through `writeSettings`.
- `src/server.ts` `serveAppPage` awaits `readSettings()` inside a try whose catch returns `500 Internal Server Error`. Validators `isValidFontFamily`, `isValidKeybindings` (with `KNOWN_SHORTCUT_IDS` from `ShortcutActions`) exist in `server.ts` and are used only on `PUT`.
- Tests: `src/lib/readit-home.test.ts` (177 lines) isolates via `READIT_HOME`; add cases there.
- Go: `go/internal/server/types.go:44-48` `Settings{Version, FontFamily, Keybindings}`; `settings.go` `ReadSettings` unmarshals into the struct and `WriteSettings` marshals it back (unknown keys dropped); `updateSettings` accepts any non-empty keybinding `ID`. Path helper `SettingsPath()` in `storage.go`.

Conventions: style guide §2.1 "parse, don't validate" at the boundary.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit tests | `bun run test -- readit-home` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Go tests | `make test` | `ok` |
| Manual | `NODE_ENV=production bun run build && bun dist/index.js test.md --no-open --port 4599` | prints URL |

## Scope

**In scope**:
- `src/server.ts` (settings route callback, `POST /api/documents` branch)
- `src/lib/readit-home.ts` (`readSettings` parse-and-fallback, preserve unknown keys), `src/lib/readit-home.test.ts`
- `go/internal/server/settings.go`, `types.go`, new `settings_test.go`
- `test/contract/bun-only.test.ts` if plan 013 exists (add the page-cache regression)

**Out of scope**:
- Watcher / server.json lifecycle (plan 017). Settings schema changes.

## Git workflow

- Branch: `advisor/010-page-cache-settings`
- Commits: `fix(server): invalidate the page cache on settings and document changes`, `fix(home): fall back to defaults on a corrupt settings file and keep unknown keys`, `fix(go): preserve unknown settings keys and validate shortcut ids`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Invalidate the page cache

- Change `updateSettingsRoute(req)` to `updateSettingsRoute(req, onSaved: () => void)`; call `onSaved()` after `writeSettings` inside the lock. In the dispatcher pass `invalidatePageCache`.
- In the `POST /api/documents` "added" branch, after `fileOrder.push(filePath)`, call `invalidatePageCache()`.

**Verify (manual, production build)**: `curl -s localhost:4599/ | grep -o '"fontFamily":"[a-z-]*"'`; `curl -s -X PUT localhost:4599/api/settings -H 'content-type: application/json' -d '{"fontFamily":"sans-serif"}'`; repeat the first → `sans-serif`.

### Step 2: Parse settings defensively and keep unknown keys

In `src/lib/readit-home.ts`:
```ts
export async function readSettings(): Promise<Settings> {
  let raw: unknown;
  try { raw = JSON.parse(await fs.readFile(settingsPath(), "utf-8")); }
  catch (err) {
    if (isErrnoException(err) && err.code === "ENOENT") return DEFAULT_SETTINGS;
    console.warn(`Ignoring unreadable settings file ${settingsPath()}:`, err instanceof Error ? err.message : err);
    return DEFAULT_SETTINGS;
  }
  return parseSettings(raw);
}
export function parseSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const o = raw as Record<string, unknown>;
  return { ...o, ...DEFAULT_SETTINGS, ...(isValidFontFamily(o.fontFamily) && { fontFamily: o.fontFamily }), ...(isValidKeybindings(o.keybindings) && { keybindings: o.keybindings }) } as Settings;
}
```
Spreading `...o` first keeps unknown keys such as `onboarded` (the CLI depends on it) — widen `Settings` to `DocumentSettings & Record<string, unknown>` or keep the cast. Move `isValidFontFamily`/`isValidKeybindings` from `server.ts` into `readit-home.ts` (export them; `server.ts` imports them — pure move, no behavior change). `ShortcutActions` import: `readit-home.ts` may import `./shortcut-registry.js`; check for cycles (`shortcut-registry.ts` must not import `readit-home.ts`).

Add to `readit-home.test.ts`: garbage file → `DEFAULT_SETTINGS`; `{ "fontFamily": 42 }` → default font; `{ "onboarded": true, "fontFamily": "serif" }` round-trips `onboarded` through `readSettings` → `writeSettings`.

**Verify**: `bun run test -- readit-home` → pass. `bun run typecheck` → exit 0. Manual: with the dev server running, `cp ~/.readit/settings.json /tmp/s.bak; echo garbage > ~/.readit/settings.json; curl -s -o /dev/null -w '%{http_code}\n' localhost:4599/` → `200`; restore the backup.

### Step 3: Go parity

`ReadSettings`: unmarshal into `map[string]json.RawMessage` and into `Settings`; keep the map on the `Server` (one new field) or return both. `WriteSettings`: marshal the struct, overlay onto the preserved map, write. Add a shortcut-id allowlist mirroring `ShortcutActions` in `src/lib/shortcut-registry.ts` and reject unknown ids with 400. New `settings_test.go`: round-trip preserves `"onboarded":true` under a temp `READIT_HOME` (the Go `Home()` honors it).

**Verify**: `make test` → `ok`.

### Step 4: Regression test (if plan 013 landed)

In `test/contract/bun-only.test.ts`: "GET / after PUT /api/settings reflects the new font" — spawn via `bunAdapter()`, PUT, then GET `/` and assert the inline JSON's `settings.fontFamily`.

## Test plan

- `readit-home.test.ts`: 3 cases (Step 2). Go: 1 case (Step 3). Bun-only contract: 1 case (Step 4, conditional).

## Done criteria

- [ ] `grep -c "invalidatePageCache" src/server.ts` is 2 higher than at `6ba758c` (was 7)
- [ ] Step 1 and Step 2 manual checks behave as described
- [ ] `bun run test`, `bun run typecheck`, `make test` exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Moving the validators into `readit-home.ts` creates an import cycle that cannot be broken by importing only `ShortcutActions`.
- The Go `Server` struct has no place to keep the preserved map without touching `server.go` beyond one field.

## Maintenance notes

- Anything embedded in the SSR page must invalidate the page cache when it changes; a `pageVersion` counter is the future simplification.
