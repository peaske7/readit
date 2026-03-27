# Go Server Rewrite Design Spec

## Summary

Rewrite readit's server and CLI from Bun/TypeScript to Go. The Svelte 5 frontend stays unchanged. Go handles all heavy computation (markdown rendering, syntax highlighting, comment storage, file watching, SSE) while Svelte handles client-side interactivity (highlights, margin notes, comment CRUD UI).

## Motivation

The current Bun server's cold-start path is dominated by Shiki WASM initialization (80-200ms) and the JSDOM mermaid worker (2-5s). A compiled Go binary with native libraries eliminates both bottlenecks:

- Process startup: 30-50ms (Bun) → <1ms (Go binary)
- Syntax highlighting init: 80-200ms (Shiki WASM) → 0ms (chroma, compiled in)
- Markdown render (3000 lines): 5-20ms (markdown-it) → <1ms (goldmark)
- Single binary distribution, no node_modules runtime dependency

Target: 50-100x improvement on server-side TTFB.

## Architecture

```
readit/
├── go/
│   ├── cmd/readit/main.go              # CLI entry point
│   ├── internal/server/
│   │   ├── server.go                   # Mux setup, static serving, dev proxy
│   │   ├── documents.go                # Document routes + file state
│   │   ├── comments.go                 # Comment CRUD routes
│   │   ├── settings.go                 # Settings routes
│   │   ├── sse.go                      # SSE broker, heartbeat, shutdown timer
│   │   ├── markdown.go                 # goldmark + chroma rendering
│   │   ├── headings.go                 # AST-based heading extraction
│   │   ├── storage.go                  # .comments.md parse/serialize
│   │   ├── anchor.go                   # Anchor resolution + fuzzy matching
│   │   ├── watcher.go                  # fsnotify file watching + debounce
│   │   ├── template.go                 # HTML page template
│   │   ├── types.go                    # Shared types
│   │   └── embed.go                    # go:embed dist/ assets
│   ├── go.mod
│   └── go.sum
├── src/                                # Svelte frontend (unchanged)
├── dist/                               # Vite build output (Go embeds this)
├── Makefile
├── vite.config.ts
└── package.json
```

Single Go package (`internal/server`) with flat files. `cmd/readit/main.go` calls `server.Start(opts)`. No nested packages, no interface indirection.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | Go | goldmark+chroma ecosystem, fast dev velocity, single binary |
| Repo structure | Monorepo (`go/` + `src/`) | Shared build pipeline, colocated frontend |
| Asset serving | `go:embed` + `--assets-dir` override | Single binary for production, filesystem for dev |
| Mermaid | Client-only with `<link rel="modulepreload">` | Eliminates JSDOM complexity, door open for server-side later |
| Dev workflow | `make dev` — Go manages Vite child process | Single command, Go proxies to Vite for HMR |
| Comment format | Keep `.comments.md` unchanged | Backward compatible, simple to parse in Go |
| File support | Markdown only | Tight scope for v1 |
| HTTP router | `net/http.ServeMux` (Go 1.22+) | Method+pattern routing, no framework dependency |
| CLI parsing | `flag` package | Simple subcommands, no cobra overhead |

## Server Core

The `Server` struct holds all shared state:

```go
type Server struct {
    mux        *http.ServeMux
    files      map[string]*FileState
    fileOrder  []string
    sse        *SSEBroker
    watcher    *Watcher
    renderer   *Renderer
    settings   Settings
    workingDir string
    clean      bool
    assetsFS   fs.FS
    template   *template.Template
    mu         sync.RWMutex
}
```

Routes registered as methods on `Server` — no handler interfaces, no middleware chain. Dev mode proxies non-API requests to Vite at `localhost:24678`.

## API Contract

The Go server implements the exact same API the Svelte frontend consumes. No changes to request/response shapes.

### Document Routes (`documents.go`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/documents` | List open files |
| POST | `/api/documents` | Add file to session |
| GET | `/api/document?path=` | Get rendered HTML + headings |

### Comment Routes (`comments.go`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/comments?path=` | List comments (with anchor resolution) |
| POST | `/api/comments?path=` | Create comment |
| PUT | `/api/comments/{id}?path=` | Update comment text |
| DELETE | `/api/comments/{id}?path=` | Delete comment |
| DELETE | `/api/comments?path=` | Delete all comments |
| PUT | `/api/comments/{id}/reanchor?path=` | Reanchor comment |
| GET | `/api/comments/raw?path=` | Raw .comments.md content |

### Settings Routes (`settings.go`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/settings` | Read settings |
| PUT | `/api/settings` | Update font family |

### SSE Endpoints (`sse.go`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/document/stream` | Document change events |
| GET | `/api/heartbeat` | Keep-alive, manages auto-shutdown |

### Other

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check (`{"status":"ok"}`) |
| GET | `/` | SSR page with inline data |
| GET | `/assets/*` | Static assets (embedded or filesystem) |

### Inline Data Shape

The root page embeds JSON in `<script type="application/json" id="__readit">`:

```json
{
  "files": [{"path": "...", "fileName": "..."}],
  "activeFile": "...",
  "clean": false,
  "workingDirectory": "...",
  "documents": {
    "/path/to/file.md": {
      "html": "...",
      "headings": [{"id": "...", "text": "...", "level": 1}],
      "comments": [...]
    }
  },
  "settings": {"version": 1, "fontFamily": "serif"}
}
```

## Markdown Pipeline (`markdown.go` + `headings.go`)

goldmark with extensions, configured once at startup:

- **GFM**: tables, strikethrough, autolinks, task lists
- **Chroma highlighting**: `onedark` style, CSS classes (not inline styles)
- **Auto heading IDs**: generated from heading text
- **Unsafe HTML**: raw HTML passthrough (matches current behavior)

Heading extraction walks the goldmark AST directly instead of regex.

Mermaid fenced code blocks pass through as `<pre><code class="language-mermaid">`. The Svelte frontend's `DocumentViewer.svelte` hydrates these client-side via lazy `import("mermaid")`. A `<link rel="modulepreload">` hint in the template accelerates the mermaid chunk download.

## Comment Storage (`storage.go` + `anchor.go`)

Parses and serializes the existing `.comments.md` format unchanged:

- Storage path: `~/.readit/comments/<mirrored-path>.comments.md`
- Format: YAML frontmatter (`source`, `hash`, `version`) + comment blocks separated by `---`
- Atomic writes: temp file + `os.Rename`
- Hash: SHA-256 of source content, truncated to 16 hex chars

Anchor resolution algorithm (direct port):

1. Exact match near `lineHint` position
2. Exact match anywhere in source
3. Normalized match (collapse whitespace)
4. Mark as `unresolved`

Two-key cache: comment file mtime + source content hash. Skip re-parsing when neither changed.

## SSE & File Watching (`sse.go` + `watcher.go`)

SSE broker manages two client sets:

- **Document stream clients**: receive `document-updated` and `document-added` events
- **Heartbeat clients**: keep-alive pings, manage auto-shutdown timer (1.5s grace after last client disconnects, production only)

File watcher uses `fsnotify` with 100ms debounce per file. On change: invalidate render cache → invalidate comment cache → broadcast SSE event.

## CLI (`cmd/readit/main.go`)

Subcommands:

- `readit <file.md> [flags]` — start server + open browser
- `readit list` — list files with comments (stdout)
- `readit show <file.md>` — print comments for file (stdout)
- `readit open <file.md>` — attach to running server or start new one

Flags:

- `--port` (default: random available)
- `--host` (default: `127.0.0.1`)
- `--no-open` (skip browser launch)
- `--clean` (clear existing comments)
- `--assets-dir` (override embedded assets)
- `--dev` (spawn Vite child process, proxy to it)

Server discovery: `~/.readit/server.json` with PID liveness check + HTTP health check. File lock (`server.lock`) prevents race conditions.

## Build & Dev Workflow

```makefile
dev:           # Go spawns Vite child process, single command
build:         # bun vite build → go build (embeds dist/)
test:          # go test ./...
test-client:   # bun run test
test-e2e:      # playwright
```

Dev mode: `make dev` → Go runs with `--dev`, spawns `bunx vite` on port 24678, proxies non-API requests. Ctrl+C kills both.

Production build: `make build` → Vite builds frontend into `dist/`, then `go build` embeds `dist/` into the binary.

## Types (`types.go`)

```go
type Comment struct {
    ID               string `json:"id"`
    SelectedText     string `json:"selectedText"`
    Comment          string `json:"comment"`
    StartOffset      int    `json:"startOffset"`
    EndOffset        int    `json:"endOffset"`
    CreatedAt        string `json:"createdAt"`
    LineHint         string `json:"lineHint,omitempty"`
    AnchorConfidence string `json:"anchorConfidence,omitempty"`
    AnchorPrefix     string `json:"anchorPrefix,omitempty"`
}

type Heading struct {
    ID    string `json:"id"`
    Text  string `json:"text"`
    Level int    `json:"level"`
}

type FileState struct {
    FilePath    string
    FileName    string
    Content     []byte
    RenderedHTML string
    Headings    []Heading
    mu          sync.Mutex
}

type Settings struct {
    Version    int    `json:"version"`
    FontFamily string `json:"fontFamily"`
}
```

JSON tags match the current API responses exactly.

## Go Dependencies

| Package | Purpose |
|---------|---------|
| `github.com/yuin/goldmark` | Markdown → HTML |
| `github.com/yuin/goldmark-highlighting/v2` | Chroma integration for goldmark |
| `github.com/alecthomas/chroma/v2` | Syntax highlighting (native Go) |
| `github.com/fsnotify/fsnotify` | Cross-platform file watching |
| `github.com/pkg/browser` | Cross-platform browser launch |

Five dependencies total. No HTTP framework, no CLI framework.

## Migration Path

1. Build Go server implementing the full API contract
2. Verify Svelte frontend works unchanged against Go server
3. Run existing E2E perf tests, compare against React/Svelte baselines
4. Remove `src/server.ts`, `src/cli.ts`, `src/lib/markdown-renderer.ts`, `src/lib/mermaid-worker.ts`, `src/lib/mermaid-renderer.ts`, `src/lib/comment-storage.ts`, `src/lib/anchor.ts`, related server-side code
5. Update `package.json` scripts to use Makefile
6. Remove server-side JS dependencies (`shiki`, `markdown-it`, `jsdom`, `mermaid`, `commander`)
