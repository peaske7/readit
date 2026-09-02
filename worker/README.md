# readit share Worker

A Cloudflare Worker that serves published readit documents. It is a third
readit server whose filesystem is an R2 bucket: the CLI renders a document
locally and pushes a snapshot; viewers get the same Svelte UI and can read
and comment; `readit pull` merges their comments back into your local file.

Design: [docs/plans/2026-09-02-share-design.md](../docs/plans/2026-09-02-share-design.md)

## One-time setup

Everything below fits in Cloudflare's free tier (Workers 100k req/day, R2 10 GB).

```bash
# 1. Log in (opens a browser)
bunx wrangler login

# 2. Create the bucket the Worker reads and writes
bunx wrangler r2 bucket create readit-shares

# 3. Set the two secrets (generate with: openssl rand -base64 32)
cd worker
bunx wrangler secret put PUBLISH_TOKEN    # what the CLI sends as the bearer token
bunx wrangler secret put COOKIE_SECRET    # signs the password-unlock cookie
cd ..

# 4. Build the frontend and deploy
bun run worker:deploy
# Serves on the custom domain in wrangler.toml (md.peas.ke); wrangler creates
# the DNS record and certificate. Remove `routes`/`workers_dev = false` to use
# the <name>.<account>.workers.dev URL instead.

# 5. Point the CLI at it
readit remote setup
```

`readit remote setup` writes `~/.readit/config.json` (mode 600). The
`READIT_REMOTE_URL` and `READIT_TOKEN` environment variables override it.

## Share modes

| Mode | Command | Who can open it |
| --- | --- | --- |
| link (default) | `readit share doc.md` | Anyone with the 128-bit unguessable URL. Not indexed. |
| public | `readit share doc.md --public` | Anyone; responses are cacheable at the edge. |
| password | `readit share doc.md --password [pw]` | Anyone with the URL and the password. Five attempts per minute per IP. |

Re-running `readit share` on the same file keeps its URL and can change the
mode. `readit unshare doc.md` deletes the share. `readit remote list` shows
everything on the remote.

## Comments

Viewers comment in the normal readit UI. `readit pull doc.md` merges their
comments into your local `.comments.md`: for comments you had already
published the web copy wins (edits and deletions), comments you added
locally since are kept, and new web comments are appended. `readit share`
runs the same merge first, so re-publishing never drops anyone's comments.

## Deploys

`.github/workflows/deploy-worker.yml` deploys on every push to `main` that
touches `worker/` or `src/`. It needs two repository secrets:

- `CLOUDFLARE_API_TOKEN`: create at *My Profile → API Tokens* with the
  **Edit Cloudflare Workers** template, then add **Workers R2 Storage: Edit**.
- `CLOUDFLARE_ACCOUNT_ID`: shown in the dashboard sidebar of any zone or on
  the Workers overview page.

Deploys never touch `PUBLISH_TOKEN` or `COOKIE_SECRET`. Rotate either by
re-running `wrangler secret put`; rotating `COOKIE_SECRET` signs everyone out
of password shares, rotating `PUBLISH_TOKEN` requires `readit remote setup`.

## Local development

```bash
bun run worker:dev        # builds the frontend, then wrangler dev on :8787
```

Put dev secrets in `worker/.dev.vars` (gitignored):

```
PUBLISH_TOKEN=dev-token
COOKIE_SECRET=dev-cookie-secret
```

R2 and the rate limiter are simulated locally; no account is needed until
you deploy. `bun run typecheck:worker` typechecks the Worker after a build.

## Layout

```
worker/
├── wrangler.toml     # bindings: ASSETS (Svelte bundle), SHARES (R2), UNLOCK_LIMITER
├── src/index.ts      # router
├── src/publish.ts    # bearer-token publisher API under /api/shares
├── src/view.ts       # viewer routes under /s/{id}: page, unlock, assets
├── src/comments.ts   # viewer comments API, same shapes as the local server
├── src/page.ts       # renders the share page with the shared template
├── src/store.ts      # R2 layout: shares/{id}/{meta.json,document.md,document.html,comments.md,assets/*}
└── src/auth.ts       # publisher token, PBKDF2 passwords, HMAC unlock cookie
```
