# Client Mode: `readit open`

## Problem

readit starts a long-running server per invocation. When used as a Claude Code PostToolUse hook, every Write/Edit on a `.md` file would spawn a new server instance. We need a way to send files to an already-running server.

## Design

### Overview

Add a `readit open <files...>` CLI command that hot-adds files to a running readit server via HTTP, or starts a new server if none exists. Uses a PID file for server discovery and the existing SSE infrastructure for browser notifications.

### 1. PID File (`~/.readit/server.json`)

**On server start** (in `startServer`):
```json
{ "port": 4567, "pid": 12345 }
```

**On shutdown** (SIGINT handler): delete the file.

**Client discovery:**
1. Read `~/.readit/server.json`
2. Verify PID is alive (`process.kill(pid, 0)`)
3. Confirm via `GET /api/health`
4. Any failure → treat as no server running

### 2. Server Endpoint: `POST /api/files`

Request body: `{ "path": "/absolute/path/to/file.md" }`

Behavior:
- **File already loaded** → re-read from disk, update `fileMap` content, broadcast SSE `{ type: "update", path }`
- **New file** → validate type, read content, add to `fileMap` + `fileOrder`, set up file watcher, broadcast SSE `{ type: "file-added", path, fileName, fileType }`

Response: `200 { path, fileName, type }`

### 3. Frontend: Handle `file-added` SSE Event

The Zustand store's SSE listener handles a new event type:
- `file-added` → add document to store, render new tab (lazy content fetch via existing pattern)

### 4. CLI Command: `readit open`

```
readit open <files...>          # Add files to running server or start new one
```

Logic:
1. Resolve and validate file paths (must exist, must be supported type)
2. Discover running server via PID file + health check
3. If server found → `POST /api/files` for each file
4. If no server → start server in foreground with the given files (same as default command)

### 5. Hook Configuration

```json
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "bash -c 'FILE=$(cat | jq -r \".tool_input.file_path\"); if [[ \"$FILE\" == *.md ]]; then bunx readit open \"$FILE\"; fi; exit 0'"
        }
      ]
    }
  ]
}
```

## Files to Modify

- `src/server/index.ts` — PID file write/cleanup, `POST /api/files` endpoint, file watcher setup for hot-added files
- `src/cli/index.ts` — new `open` subcommand with server discovery logic
- Frontend store — handle `file-added` SSE event type

## Verification

1. Start `readit test.md`
2. Run `readit open other.md` in another terminal
3. Confirm new tab appears in browser with `other.md`
4. Edit `other.md` on disk → confirm live reload works
5. Kill server, run `readit open test.md` → confirm new server starts
6. Run `readit open test.md` again (already loaded) → confirm content refreshes without duplicate tab
