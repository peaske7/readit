# Plan 016: Do not echo the publish token during `readit remote setup`, and require HTTPS remotes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 6ba758c..HEAD -- src/remote.ts src/cli.ts worker/README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (009 recommended: it adds `remote.test.ts`)
- **Category**: security
- **Planned at**: commit `6ba758c`, 2026-09-04
- **Issue**: https://github.com/peaske7/readit/issues/38

## Why this matters

The publish token is the single credential guarding the hosted share surface. `readit remote setup` reads it through a `readline` interface with `output: process.stdout` and no masking, so it lands in terminal scrollback, session recordings, and any log of the setup. The remote URL is accepted without a scheme check, so a typo (`http://`) sends the bearer token in cleartext. Storage is already correct (`config.json` written with mode 0600 and an explicit `chmod`). Because the token has certainly been echoed at least once, the plan ends with rotation instructions for the operator (not for the executor to run).

## Current state

- `src/remote.ts` `ask` (~63-68):
```ts
export async function ask(questions: string[]): Promise<string[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY ?? false,
  });
```
Lines 75-105 buffer lines so piped stdin works ("Lines are buffered as they arrive, so this works both interactively and with piped stdin").
- `src/cli.ts` `remote setup` action (~650-680; the `ask([...])` call is at ~659): `ask(["Worker URL (e.g. https://md.peas.ke): ", "Publish token: "])`, trims, `saveRemote`, then verifies with `remoteFetch(remote, "/api/shares")` and exits 1 on rejection.
- `src/remote.ts` `loadRemote` (~18-40) also accepts `READIT_REMOTE_URL`/`READIT_TOKEN` env vars.
- `src/remote.ts` `saveRemote` — writes `remoteConfigPath()` (from `src/lib/readit-home.ts`) with mode 0600 + `chmod`.
- `worker/README.md` "One-time setup" step 5 and the paragraph on `readit remote setup`.

Conventions: CLI errors print `error: …` and `process.exit(1)`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test -- remote` | all pass |
| Manual | `bun src/cli.ts remote setup` | prompts; token not echoed |

## Scope

**In scope**:
- `src/remote.ts` (`ask` gains a `secret` option; new `parseRemoteUrl`)
- `src/cli.ts` (`remote setup` action)
- `src/remote.test.ts` (create or extend from plan 009)
- `worker/README.md` (rotation note)

**Out of scope**:
- Changing where the token is stored or the env-var override.
- The Worker.

## Git workflow

- Branch: `advisor/016-remote-setup-hygiene`
- Commit: `fix(cli): mask the publish token prompt and require an https remote`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Masked prompt

Change `ask` to accept `questions: Array<string | { prompt: string; secret?: boolean }>`. For a `secret` question on a TTY, write the prompt, set `process.stdin.setRawMode(true)`, read keystrokes until `\r`/`\n`, handle backspace (`\x7f`), echo nothing (or `*`), then restore raw mode. When stdin is not a TTY, read the line as today (piped setups keep working). Keep the existing buffering path for non-secret questions.

**Verify**: `bun run typecheck` → exit 0. Manual: `bun src/cli.ts remote setup`, type a URL, then type `abc` at the token prompt → nothing echoed; Ctrl+C aborts cleanly (raw mode restored — the terminal must still echo afterwards).

### Step 2: URL validation

Add to `src/remote.ts`:
```ts
export function parseRemoteUrl(input: string): string {
  const url = new URL(input.trim());   // throws on garbage
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("Remote URL must use https:// (http:// is allowed only for localhost).");
  }
  return url.origin;
}
```
Use it in `remote setup` (`error: ${message}` + exit 1 on throw) and in `loadRemote` for the env-var and config paths (so a bad stored URL is reported at use time rather than silently sending the token).

**Verify**: add tests in `src/remote.test.ts`: `https://md.peas.ke/` → `https://md.peas.ke`; `http://localhost:8787` → accepted; `http://md.peas.ke` → throws; `md.peas.ke` (no scheme) → throws. `bun run test -- remote` → pass.

### Step 3: Docs and rotation note

In `worker/README.md` under "One-time setup", after step 5 add: "The token prompt does not echo. If you set up readit before 2026-09, the token was echoed to your terminal; rotate it with `wrangler secret put PUBLISH_TOKEN` and re-run `readit remote setup`." **Executor: do not run `wrangler secret put` yourself** — that is the operator's action.

## Test plan

- `remote.test.ts`: four `parseRemoteUrl` cases; `ask` masking is manual (raw-mode TTY is not unit-testable here).

## Done criteria

- [ ] `bun run typecheck`, `bun run test` exit 0
- [ ] `grep -n "secret: true" src/cli.ts` → one match (the token prompt)
- [ ] `grep -n "parseRemoteUrl" src/remote.ts src/cli.ts` → ≥ 3 matches
- [ ] Manual masked-prompt check done and terminal echo restored afterwards
- [ ] `worker/README.md` rotation note present
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `process.stdin.setRawMode` is unavailable under Bun in this environment (report; fall back to `readline` with `output: undefined` and a manual prompt write, which at least prevents echo of the typed line on most terminals).

## Maintenance notes

- Any future secret prompt (e.g. share password when `--password` is given without a value — check `src/cli.ts` for how the password prompt is read today and reuse `secret: true` there too; mention in your report if it also echoes).
