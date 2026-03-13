# Client Mode (`readit open`) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `readit open` CLI command that hot-adds files to a running readit server, or starts a new one if none exists.

**Architecture:** PID file (`~/.readit/server.json`) for server discovery. New `POST /api/files` endpoint on the existing Bun.serve() for hot-adding files. Existing SSE infrastructure broadcasts `file-added` events to the frontend. Extract `getFileType` to shared lib to avoid duplication.

**Tech Stack:** Bun, Commander.js, existing SSE, Zustand store

---

### Task 1: Extract `getFileType` to shared lib

`getFileType` is currently defined in `src/cli/index.ts` and will be needed in both CLI and server code.

**Files:**
- Modify: `src/lib/utils.ts`
- Modify: `src/cli/index.ts`

**Step 1: Add `getFileType` to `src/lib/utils.ts`**

```ts
import type { DocumentType } from "../types";

export function getFileType(filePath: string): DocumentType | null {
  if (filePath.endsWith(".md") || filePath.endsWith(".markdown")) {
    return "markdown";
  }
  if (filePath.endsWith(".html") || filePath.endsWith(".htm")) {
    return "html";
  }
  return null;
}
```

**Step 2: Update `src/cli/index.ts` to import from shared lib**

Replace the local `getFileType` function with:
```ts
import { getFileType } from "../lib/utils.js";
```

Remove the local `getFileType` function definition (lines 22-30).

**Step 3: Verify build passes**

Run: `bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add src/lib/utils.ts src/cli/index.ts
git commit -m "refactor: extract getFileType to shared lib"
```

---

### Task 2: Add PID file write/cleanup to server

**Files:**
- Modify: `src/server/index.ts` — write `~/.readit/server.json` on start, delete on shutdown
- Modify: `src/cli/index.ts` — clean up PID file in SIGINT handler

**Step 1: Add PID file helpers to `src/server/index.ts`**

Add near the top of the file, after the existing helpers:

```ts
const SERVER_INFO_PATH = path.join(os.homedir(), ".readit", "server.json");

async function writeServerInfo(port: number): Promise<void> {
  await fs.mkdir(path.dirname(SERVER_INFO_PATH), { recursive: true });
  await fs.writeFile(
    SERVER_INFO_PATH,
    JSON.stringify({ port, pid: process.pid }),
    "utf-8",
  );
}

async function removeServerInfo(): Promise<void> {
  try {
    await fs.unlink(SERVER_INFO_PATH);
  } catch (err) {
    if (!isErrnoException(err) || err.code !== "ENOENT") {
      console.error("Failed to remove server info:", err);
    }
  }
}
```

**Step 2: Call `writeServerInfo` at end of `startServer`**

In the `startServer` function, after the server is successfully created, before the `return`:

```ts
await writeServerInfo(actualPort);
```

**Step 3: Export `removeServerInfo` and `SERVER_INFO_PATH`**

Export both so the CLI can use them in its SIGINT handler:

```ts
export { SERVER_INFO_PATH, removeServerInfo };
```

**Step 4: Update SIGINT handler in `src/cli/index.ts`**

```ts
import { removeServerInfo } from "../server/index.js";

// In the SIGINT handler:
process.on("SIGINT", async () => {
  console.log("\n\nShutting down...");
  server.stop();
  await removeServerInfo();
  process.exit(0);
});
```

**Step 5: Verify build passes**

Run: `bun run typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add src/server/index.ts src/cli/index.ts
git commit -m "feat: write/cleanup PID file on server start/stop"
```

---

### Task 3: Add `POST /api/files` endpoint to server

This endpoint hot-adds or refreshes files in a running server.

**Files:**
- Modify: `src/server/index.ts`

**Step 1: Extract watcher setup into a reusable function**

The file watcher logic (lines 686-719) needs to be callable for hot-added files too. Extract it within `createServer`:

```ts
function watchFile(filePath: string): FSWatcher | null {
  try {
    const watcher = watch(filePath, async (eventType) => {
      if (eventType !== "change") return;

      const state = fileMap.get(filePath);
      if (!state) return;

      if (state.debounceTimer) clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(async () => {
        try {
          const newContent = await fs.readFile(filePath, "utf-8");
          if (newContent !== state.content) {
            state.content = newContent;
            console.log(`File changed: ${basename(filePath)}`);

            const message = `data: ${JSON.stringify({ type: "update", path: filePath })}\n\n`;
            for (const controller of sseClients) {
              try {
                controller.enqueue(message);
              } catch {
                sseClients.delete(controller);
              }
            }
          }
        } catch (err) {
          console.error(`Failed to read updated file ${filePath}:`, err);
        }
      }, 100);
    });
    return watcher;
  } catch (err) {
    console.warn(`File watching not available for ${filePath}:`, err);
    return null;
  }
}
```

Replace the inline watcher loop with:
```ts
for (const filePath of fileOrder) {
  const watcher = watchFile(filePath);
  if (watcher) watchers.push(watcher);
}
```

**Step 2: Add `POST /api/files` route**

Add inside the `fetch` handler in `createServer`, after the `/api/documents` route:

```ts
if (pathname === "/api/files" && method === "POST") {
  try {
    const { path: requestedPath } = await req.json();

    if (!requestedPath || typeof requestedPath !== "string") {
      return errorResponse("Missing 'path' field", 400);
    }

    const filePath = path.resolve(requestedPath);
    const fileType = getFileType(filePath);

    if (!fileType) {
      return errorResponse(
        `Unsupported file type: ${filePath} (expected .md, .markdown, .html, or .htm)`,
        400,
      );
    }

    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (err) {
      if (isErrnoException(err) && err.code === "ENOENT") {
        return errorResponse(`File not found: ${filePath}`, 404);
      }
      throw err;
    }

    const existingState = fileMap.get(filePath);

    if (existingState) {
      // File already loaded — refresh content
      existingState.content = content;
      const message = `data: ${JSON.stringify({ type: "update", path: filePath })}\n\n`;
      for (const controller of sseClients) {
        try {
          controller.enqueue(message);
        } catch {
          sseClients.delete(controller);
        }
      }
    } else {
      // New file — add to server
      fileMap.set(filePath, {
        content,
        type: fileType,
        debounceTimer: null,
      });
      fileOrder.push(filePath);

      // Set up file watcher for the new file
      const watcher = watchFile(filePath);
      if (watcher) watchers.push(watcher);

      const message = `data: ${JSON.stringify({
        type: "file-added",
        path: filePath,
        fileName: basename(filePath),
        fileType,
      })}\n\n`;
      for (const controller of sseClients) {
        try {
          controller.enqueue(message);
        } catch {
          sseClients.delete(controller);
        }
      }
    }

    return json({
      path: filePath,
      fileName: basename(filePath),
      type: fileType,
    });
  } catch (err) {
    console.error("Failed to add file:", err);
    return errorResponse("Failed to add file", 500);
  }
}
```

**Step 3: Add the `getFileType` import**

```ts
import { getFileType } from "../lib/utils.js";
```

**Step 4: Verify build passes**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add src/server/index.ts
git commit -m "feat: add POST /api/files endpoint for hot-adding files"
```

---

### Task 4: Handle `file-added` SSE event in frontend

**Files:**
- Modify: `src/hooks/useDocument.ts`

**Step 1: Add `file-added` handling to SSE listener**

In the `eventSource.onmessage` handler (around line 90), add a branch for `file-added`:

```ts
eventSource.onmessage = async (e) => {
  try {
    const data = JSON.parse(e.data);

    if (data.type === "file-added" && data.path) {
      appStore.getState().openDocument({
        content: "", // Lazy-loaded when tab activated
        type: data.fileType,
        filePath: data.path,
        fileName: data.fileName,
        clean: false,
      });
      return;
    }

    if (data.type === "update" && data.path) {
      // ... existing update logic unchanged
    }
  } catch {
    // Ignore non-JSON messages ("connected", "ping")
  }
};
```

**Step 2: Verify build passes**

Run: `bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/useDocument.ts
git commit -m "feat: handle file-added SSE event for hot-added documents"
```

---

### Task 5: Add `readit open` CLI command

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Add server discovery function**

Add after the imports:

```ts
import { readFileSync as readFileSyncNode } from "node:fs";

interface ServerInfo {
  port: number;
  pid: number;
}

async function discoverServer(): Promise<ServerInfo | null> {
  const serverInfoPath = join(os.homedir(), ".readit", "server.json");

  try {
    const content = readFileSyncNode(serverInfoPath, "utf-8");
    const info: ServerInfo = JSON.parse(content);

    // Verify the process is alive
    try {
      process.kill(info.pid, 0);
    } catch {
      return null;
    }

    // Verify health endpoint responds
    try {
      const res = await fetch(`http://127.0.0.1:${info.port}/api/health`);
      if (!res.ok) return null;
    } catch {
      return null;
    }

    return info;
  } catch {
    return null;
  }
}
```

**Step 2: Add `open` subcommand**

Add before `program.parse()`:

```ts
program
  .command("open")
  .argument("<files...>", "Markdown or HTML files to add to running server")
  .description("Add files to a running readit server, or start a new one")
  .option("-p, --port <number>", "Port for new server (if starting)", "4567")
  .option("--host <address>", "Host for new server (if starting)", "127.0.0.1")
  .action(
    async (
      fileArgs: string[],
      options: { port: string; host: string },
    ) => {
      // Resolve and validate files
      const resolvedFiles: { path: string; type: DocumentType }[] = [];
      for (const arg of fileArgs) {
        const filePath = resolve(process.cwd(), arg);

        if (!existsSync(filePath)) {
          console.error(`error: not found: ${filePath}`);
          process.exit(1);
        }

        const type = getFileType(filePath);
        if (!type) {
          console.error(
            `error: unsupported file type: ${arg} (expected .md, .markdown, .html, or .htm)`,
          );
          process.exit(1);
        }

        resolvedFiles.push({ path: filePath, type });
      }

      // Try to find running server
      const server = await discoverServer();

      if (server) {
        // Send files to running server
        for (const file of resolvedFiles) {
          try {
            const res = await fetch(
              `http://127.0.0.1:${server.port}/api/files`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: file.path }),
              },
            );

            if (!res.ok) {
              const data = await res.json();
              console.error(
                `error: failed to add ${file.path}: ${data.error}`,
              );
              process.exit(1);
            }

            const data = await res.json();
            console.log(`Added: ${data.fileName} (${data.type})`);
          } catch (err) {
            console.error(
              `error: failed to connect to server:`,
              err instanceof Error ? err.message : err,
            );
            process.exit(1);
          }
        }

        console.log(
          `\nServer: http://127.0.0.1:${server.port}`,
        );
        return;
      }

      // No running server — start one
      console.log("No running server found, starting new one...\n");

      const files = resolvedFiles.map((f) => ({
        content: readFileSync(f.path, "utf-8"),
        type: f.type,
        filePath: f.path,
      }));

      const preferredPort = Number.parseInt(options.port, 10);
      try {
        const { url, server: newServer } = await startServer({
          files,
          port: preferredPort,
          host: options.host,
        });

        const fileList = files.map((f) => `  ${f.filePath} (${f.type})`);
        console.log(`
readit - Document Review Tool

  ${files.length === 1 ? "File:" : "Files:"}
${fileList.join("\n")}
  URL:  ${url}

  Server running. Close browser tab to stop.
  Press Ctrl+C to force stop.
`);

        open(url);

        process.on("SIGINT", async () => {
          console.log("\n\nShutting down...");
          newServer.stop();
          await removeServerInfo();
          process.exit(0);
        });
      } catch (error) {
        console.error(
          "error: failed to start server:",
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    },
  );
```

**Step 3: Add missing imports**

Make sure these imports are at the top of the file:

```ts
import { getFileType } from "../lib/utils.js";
import { removeServerInfo } from "../server/index.js";
import type { DocumentType } from "../types/index.js";
```

**Step 4: Verify build passes**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add readit open command for client mode"
```

---

### Task 6: Update the hook configuration

**Files:**
- Modify: `/Users/jay/.claude/settings.json`

**Step 1: Update the PostToolUse hook**

Change the command from `open -a Arto` to `bunx readit open`:

```json
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
```

**Step 2: Verify the hook fires correctly**

Write or edit any `.md` file and confirm the hook runs without error.

---

### Task 7: End-to-end verification

**Step 1: Build the project**

Run: `bun run build`
Expected: Successful build

**Step 2: Start server with a test file**

Run: `bunx readit test.md`
Expected: Server starts, browser opens

**Step 3: Open another file via client mode**

In another terminal:
Run: `bunx readit open README.md`
Expected: "Added: README.md (markdown)" printed, new tab appears in browser

**Step 4: Verify live reload for hot-added file**

Edit `README.md` on disk, confirm the browser updates automatically.

**Step 5: Verify reload for already-loaded file**

Run: `bunx readit open test.md`
Expected: Content refreshes, no duplicate tab

**Step 6: Verify auto-start when no server running**

Stop the server (Ctrl+C), then:
Run: `bunx readit open test.md`
Expected: New server starts with `test.md`
