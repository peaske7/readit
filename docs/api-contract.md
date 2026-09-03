# readit API contract

Three servers speak this API to the same Svelte frontend:

| Server | Source | Runs as |
|---|---|---|
| Bun | `src/server.ts` | `bunx readit <file>` / `dist/index.js` |
| Go | `go/internal/server/server.go` | the released binary, `dist/readit` |
| Worker | `worker/src/*.ts` | a published share on Cloudflare, under `/s/{id}` |

This document is the contract. `test/contract/` is the same contract as a
runnable suite: `bun run test:contract` sends the shared route set to each
server and asserts the response shapes below. Per-server deviations are
declared in the adapters (`test/contract/adapters.ts`), never discovered.

## Conventions

- All request and response bodies are JSON, `content-type: application/json`.
- `?path=<absolute path>` selects the document on the local servers. It is
  optional: they fall back to the first file opened at startup. The Worker
  ignores it, because a share holds exactly one document.
- Errors are `{ "error": string }` with a 4xx/5xx status.
- `apiBase` is `""` for the local servers and `/s/{id}` for the Worker. The
  frontend prefixes every request with it (`src/lib/api.ts`).

## Route table

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/documents` | — | `{ files: [{ path, fileName }], clean: boolean, workingDirectory: string }` |
| POST | `/api/documents` | `{ path: string }` | `{ path, fileName, status: "added" \| "present" }` |
| GET | `/api/document` | `?path=` | `{ html: string, headings: Heading[], filePath: string, fileName: string, clean: boolean }` |
| PATCH | `/api/document/task` | `{ path, index: number, checked: boolean }` | `{ status: "ok" \| "unchanged" }` |
| GET | `/api/comments` | `?path=` | `{ comments: Comment[] }`, anchors resolved |
| POST | `/api/comments` | `{ selectedText, comment, startOffset, endOffset }` | `201 { comment: Comment }` |
| DELETE | `/api/comments` | `?path=` | `{ success: true }` |
| PUT | `/api/comments/{id}` | `{ comment: string }` | `{ comment: Comment }`, `404` if unknown |
| DELETE | `/api/comments/{id}` | `?path=` | `{ success: true }`, `404` if unknown |
| PUT | `/api/comments/{id}/reanchor` | `{ selectedText, startOffset, endOffset }` | `{ comment: Comment }`, `404` if unknown |
| GET | `/api/comments/raw` | `?path=` | `{ content: string \| null, path: string }` |
| GET | `/api/health` | — | `{ status: "ok" }` |
| GET | `/api/settings` | — | `DocumentSettings` |
| PUT | `/api/settings` | `{ fontFamily?, keybindings? }` | the merged `DocumentSettings` |
| GET | `/api/document/stream` | — | SSE, see below |
| GET | `/api/heartbeat` | — | SSE, see below |
| GET | `/api/share` | `?path=` | `{ configured: boolean, share?: ShareRecord }` |
| POST | `/api/share` | `{ mode: ShareMode, password? }` | `ShareRecord` |
| DELETE | `/api/share` | `?path=` | `{ removed: boolean }` |
| GET | `/` | — | the app page with inline `InlineData` |
| GET | `/assets/*` | — | the Svelte bundle |

`Comment`, `DocumentSettings`, `InlineData`, `ShareMode` and the anchor
confidence values are defined in `src/schema.ts`; `Heading` is
`{ id: string, text: string, level: number }`.

### Comment shape

```jsonc
{
  "id": "a1b2c3d4",            // 8 hex chars
  "selectedText": "…",         // truncated at 1000 chars
  "comment": "…",
  "createdAt": "2026-09-04T00:00:00.000Z",
  "startOffset": 42,           // into the extracted DOM text
  "endOffset": 57,
  "lineHint": "L12",
  "anchorConfidence": "exact", // exact | normalized | fuzzy | unresolved
  "anchorPrefix": "…"          // only for selections over 1000 chars
}
```

`startOffset`, `endOffset`, `lineHint` and `anchorConfidence` are **derived on
read**, not trusted from the client: every server re-resolves the stored
`selectedText` against the current source and rendered HTML
(`src/lib/resolve-comments.ts`, `go/internal/server/anchor.go`).

### SSE events

`GET /api/document/stream` — one open stream per browser tab. Payloads are
JSON in the `data:` field of an unnamed event:

| Payload | Meaning |
|---|---|
| `connected` (plain text) | Stream opened |
| `ping` (plain text) | Keep-alive, every 5s |
| `{ "type": "document-updated", "path": string }` | File changed on disk |
| `{ "type": "document-added", "path": string, "fileName": string }` | `POST /api/documents` opened a file |

`GET /api/heartbeat` — liveness from the browser. Same `connected` / `ping`
frames; when the last heartbeat closes, the local servers exit after 1.5s.

## Per-server deviations

Declared, not discovered. The contract suite skips a route a server omits.

| Route | Bun | Go | Worker |
|---|---|---|---|
| `GET/POST /api/documents` | yes | yes | **no** — a share holds one document |
| `GET /api/document` | yes | yes | yes |
| `PATCH /api/document/task` | yes | yes | **no** — snapshots are read-only |
| comments CRUD, reanchor, raw | yes | yes | yes |
| `GET/PUT /api/settings` | yes | yes | **no** — hosted mode uses localStorage |
| `GET /api/document/stream`, `/api/heartbeat` | yes | yes | **no** — nothing is watching a snapshot |
| `GET /api/health` | yes | yes | at the origin root only, not under `/s/{id}` |
| `GET/POST/DELETE /api/share` | yes | **no** | **no** — the Worker is the share target |

The Worker adds a publisher API the other two do not have, used by
`readit share` / `pull` / `unshare` and documented in
`docs/plans/2026-09-02-share-design.md` §5.1: `GET|POST /api/shares`,
`PUT|PATCH|DELETE /api/shares/{id}`, `GET /api/shares/{id}/comments`,
`HEAD|PUT /api/shares/{id}/assets/{name}`. Every one requires
`Authorization: Bearer <token>`. Viewer routes `GET /s/{id}`,
`POST /s/{id}/unlock` and `GET /s/{id}/assets/{name}` are share-specific too.

### Known drift

Same route, different behaviour. Not asserted by the suite; fix or accept.

| Case | Bun | Go | Worker |
|---|---|---|---|
| `POST /api/comments` with `comment: ""` | `201` | `400` | `201` |
| `PUT /api/comments/{id}/reanchor` without `selectedText` | `400` | `200`, anchors to `""` | `400` |
| Comment routes when no `.comments.md` exists yet | `404 Comment not found` | `404 comment file not found` | `404 Comment not found` |
| Whitespace around a new comment's text | kept | trimmed | kept |

## Running the suite

```bash
bun run build          # Bun adapter: dist/index.js
make build-server      # Go adapter: dist/readit (run after any vite build)
bun run build:worker   # Worker adapter: worker/public + worker/src/manifest.json
bun run test:contract
```

Each adapter is skipped, with the command to enable it, when its artifact is
missing — so the suite is useful with any subset built. CI builds the frontend
and CLI, so the Bun adapter runs there; the Go and Worker adapters skip.

What each adapter does:

- **Bun** — spawns `bun dist/index.js <fixture> --no-open --port <free port>`.
- **Go** — spawns `dist/readit <fixture> --no-open --port <free port>`.
- **Worker** — spawns `wrangler dev` (local mode, simulated R2 persisted to a
  temp directory, `PUBLISH_TOKEN` passed with `--var`), publishes a fixture
  share through the publisher API, and tests `/s/{id}/api/*`. No Cloudflare
  account or secret is involved.

The local servers run with `HOME` pointed at a temp directory, so the suite
never touches the developer's `~/.readit`.
