#!/usr/bin/env bun

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
import open from "open";
import { getCommentPath, parseCommentFile } from "../lib/comment-storage.js";
import { getFileType } from "../lib/utils.js";
import type { FileEntry } from "../server/index.js";
import { removeServerInfo, startServer } from "../server/index.js";
import type { DocumentType } from "../types/index.js";

const program = new Command();

function isPermissionError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "EACCES"
  );
}

interface ServerInfo {
  port: number;
  pid: number;
}

async function discoverServer(): Promise<ServerInfo | null> {
  const serverInfoPath = join(os.homedir(), ".readit", "server.json");

  try {
    const content = readFileSync(serverInfoPath, "utf-8");
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

/**
 * Recursively find all .comments.md files in a directory.
 */
function findCommentFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const lstat = lstatSync(fullPath);
        if (lstat.isSymbolicLink()) continue;
        if (lstat.isDirectory()) {
          results.push(...findCommentFiles(fullPath));
        } else if (entry.endsWith(".comments.md")) {
          results.push(fullPath);
        }
      } catch (err) {
        if (isPermissionError(err)) {
          console.warn(`Warning: Permission denied: ${fullPath}`);
        }
      }
    }
  } catch (err) {
    if (isPermissionError(err)) {
      console.warn(`Warning: Permission denied: ${dir}`);
    }
  }

  return results;
}

/**
 * Recursively find reviewable files (.md, .markdown, .html, .htm) in a directory.
 */
function findReviewableFiles(dir: string): FileEntry[] {
  const results: FileEntry[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      // Skip hidden directories and node_modules
      if (entry.startsWith(".") || entry === "node_modules") continue;

      const fullPath = join(dir, entry);
      try {
        const lstat = lstatSync(fullPath);
        if (lstat.isSymbolicLink()) continue;
        if (lstat.isDirectory()) {
          results.push(...findReviewableFiles(fullPath));
        } else {
          const type = getFileType(entry);
          if (type) {
            results.push({
              content: readFileSync(fullPath, "utf-8"),
              type,
              filePath: fullPath,
            });
          }
        }
      } catch (err) {
        if (isPermissionError(err)) {
          console.warn(`Warning: Permission denied: ${fullPath}`);
        }
      }
    }
  } catch (err) {
    if (isPermissionError(err)) {
      console.warn(`Warning: Permission denied: ${dir}`);
    }
  }

  return results;
}

/**
 * Resolve CLI arguments into a deduplicated list of FileEntry objects.
 */
function resolveFiles(args: string[]): FileEntry[] {
  const seen = new Set<string>();
  const files: FileEntry[] = [];

  for (const arg of args) {
    const filePath = resolve(process.cwd(), arg);

    if (!existsSync(filePath)) {
      console.error(`error: not found: ${filePath}`);
      process.exit(1);
    }

    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      const found = findReviewableFiles(filePath);
      for (const entry of found) {
        if (!seen.has(entry.filePath)) {
          seen.add(entry.filePath);
          files.push(entry);
        }
      }
    } else {
      if (seen.has(filePath)) continue;

      const type = getFileType(filePath);
      if (!type) {
        console.error(
          `error: unsupported file type: ${arg} (expected .md, .markdown, .html, or .htm)`,
        );
        process.exit(1);
      }

      seen.add(filePath);
      files.push({
        content: readFileSync(filePath, "utf-8"),
        type,
        filePath,
      });
    }
  }

  return files;
}

// ─── Onboarding ──────────────────────────────────────────────────────

const SETTINGS_PATH = join(os.homedir(), ".readit", "settings.json");

function isOnboarded(): boolean {
  try {
    const content = readFileSync(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(content);
    return settings.onboarded === true;
  } catch {
    return false;
  }
}

async function markOnboarded(): Promise<void> {
  let settings: Record<string, unknown> = {};
  try {
    const content = readFileSync(SETTINGS_PATH, "utf-8");
    settings = JSON.parse(content);
  } catch {
    // No existing settings
  }
  settings.onboarded = true;
  const dir = join(os.homedir(), ".readit");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

const WELCOME_CONTENT = `# Welcome to readit

A simple tool for reviewing markdown with inline comments.

---

## How It Works

readit follows a simple loop: **read → comment → extract**.

### 1. Read

You're already doing this. Open any markdown file with \`readit <file.md>\` and it renders in your browser with a clean reading experience.

### 2. Comment

Select any text to add a comment. Try it now — **select this sentence** and type your first comment.

Your comments appear as margin notes next to the highlighted text, just like reviewing a document in Google Docs. Add as many as you need.

### 3. Extract

When you're done reviewing, click the menu in the top-right and choose **Copy as Prompt**. This exports all your comments in a format ready for Claude, ChatGPT, or any AI assistant.

You can also export as JSON if you prefer structured data.

---

## Everything is Plain Markdown

Your comments are saved as \`.comments.md\` files in \`~/.readit/comments/\`. No database, no lock-in — just readable markdown files you can version control, search, or edit by hand.

Each comment file looks something like this:

\`\`\`markdown
## Comment 1
**Selected:** "select this sentence"
**Comment:** This is my first comment!
**Created:** 2024-01-15T10:30:00Z
\`\`\`

---

## Navigating Comments

Once you have multiple comments, use the navigation bar at the bottom of the screen to jump between them. You can also use keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| \`Alt + ↑\` | Previous comment |
| \`Alt + ↓\` | Next comment |
| \`⌘ + C\` | Copy selected text (raw) |
| \`⌘ + Shift + C\` | Copy selected text with context (for AI) |

---

## Quick Start

\`\`\`bash
# Review a markdown file
readit document.md

# Use a custom port
readit document.md --port 3000

# Start fresh (clear existing comments)
readit document.md --clean
\`\`\`

---

## Try It Now

Go ahead and add a few comments to this document. When you're done, export them and see the output. That's the entire workflow — simple, transparent, and designed for reviewing AI-generated content.
`;

const WELCOME_PATH = join(os.homedir(), ".readit", "welcome.md");

// ─── Program ─────────────────────────────────────────────────────────

program
  .name("readit")
  .description("Review Markdown and HTML documents with inline comments")
  .version("0.1.3");

// List command: show all commented files
program
  .command("list")
  .description("List all files with comments")
  .action(async () => {
    const readitDir = join(os.homedir(), ".readit", "comments");

    if (!existsSync(readitDir)) {
      console.log("No comments found.");
      return;
    }

    const commentFiles = findCommentFiles(readitDir);

    if (commentFiles.length === 0) {
      console.log("No comments found.");
      return;
    }

    console.log(`\nFound ${commentFiles.length} file(s) with comments:\n`);

    for (const file of commentFiles) {
      try {
        const content = readFileSync(file, "utf-8");
        const parsed = parseCommentFile(content);
        const commentCount = parsed.comments.length;
        const sourcePath = parsed.source || "(unknown source)";

        console.log(`  ${sourcePath}`);
        console.log(
          `    ${commentCount} comment${commentCount !== 1 ? "s" : ""}`,
        );
        console.log();
      } catch {
        // Skip unreadable files
      }
    }
  });

// Show command: display comments for a file
program
  .command("show <file>")
  .description("Show comments for a file")
  .action(async (file: string) => {
    const filePath = resolve(process.cwd(), file);
    const commentPath = getCommentPath(filePath);

    if (!existsSync(commentPath)) {
      console.log(`No comments found for: ${filePath}`);
      return;
    }

    try {
      const content = await fs.readFile(commentPath, "utf-8");
      const parsed = parseCommentFile(content);

      if (parsed.comments.length === 0) {
        console.log(`No comments found for: ${filePath}`);
        return;
      }

      console.log(`\nComments for: ${filePath}`);
      console.log(`${"─".repeat(60)}\n`);

      for (let i = 0; i < parsed.comments.length; i++) {
        const comment = parsed.comments[i];
        console.log(`[${i + 1}] ${comment.lineHint || "L?"}`);
        console.log(
          `Selected: "${comment.selectedText.slice(0, 80)}${comment.selectedText.length > 80 ? "..." : ""}"`,
        );
        console.log(`Comment: ${comment.comment}`);
        console.log(`Created: ${comment.createdAt}`);
        console.log();
      }
    } catch (err) {
      console.error(
        "error: failed to read comments:",
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  });

// Main review command (default) — accepts zero or more files/directories
program
  .argument("[files...]", "Markdown or HTML files/directories to review")
  .option("-p, --port <number>", "Port to run server on", "4567")
  .option("--host <address>", "Host address to bind to", "127.0.0.1")
  .option("--no-open", "Don't automatically open browser")
  .option("--clean", "Clear all existing comments on startup")
  .action(
    async (
      fileArgs: string[],
      options: {
        port: string;
        host: string;
        open: boolean;
        clean: boolean;
      },
    ) => {
      let files: FileEntry[];

      if (fileArgs.length === 0) {
        if (isOnboarded()) {
          files = [];
        } else {
          files = [
            {
              content: WELCOME_CONTENT,
              type: "markdown" as DocumentType,
              filePath: WELCOME_PATH,
            },
          ];
        }
      } else {
        files = resolveFiles(fileArgs);

        if (files.length === 0) {
          console.error("error: no reviewable files found");
          process.exit(1);
        }
      }

      const preferredPort = Number.parseInt(options.port, 10);

      if (
        Number.isNaN(preferredPort) ||
        preferredPort < 1 ||
        preferredPort > 65535
      ) {
        console.error(`error: invalid port number: ${options.port}`);
        process.exit(1);
      }

      try {
        const { url, server } = await startServer({
          files,
          port: preferredPort,
          host: options.host,
          clean: options.clean,
        });

        if (files.length === 0) {
          console.log(`
readit - Document Review Tool

  URL:  ${url}

  No files specified. Add files with:
    readit open <file.md>

  Server running. Press Ctrl+C to stop.
`);
        } else {
          const fileList = files.map((f) => `  ${f.filePath} (${f.type})`);

          console.log(`
readit - Document Review Tool

  ${files.length === 1 ? "File:" : "Files:"}
${fileList.join("\n")}
  URL:  ${url}

  Server running. Close browser tab to stop.
  Press Ctrl+C to force stop.
`);
        }

        if (options.open) {
          open(url);
        }

        // Mark onboarding complete on first server start
        if (fileArgs.length === 0) {
          await markOnboarded();
        }

        // Graceful shutdown on Ctrl+C
        process.on("SIGINT", async () => {
          console.log("\n\nShutting down...");
          server.stop();
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

// Open command: add files to running server or start new one
program
  .command("open")
  .argument("<files...>", "Markdown or HTML files to add to running server")
  .description("Add files to a running readit server, or start a new one")
  .option("-p, --port <number>", "Port for new server (if starting)", "4567")
  .option("--host <address>", "Host for new server (if starting)", "127.0.0.1")
  .action(
    async (fileArgs: string[], options: { port: string; host: string }) => {
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
              console.error(`error: failed to add ${file.path}: ${data.error}`);
              process.exit(1);
            }

            const data = await res.json();
            console.log(`Added: ${data.fileName} (${data.type})`);
          } catch (err) {
            console.error(
              "error: failed to connect to server:",
              err instanceof Error ? err.message : err,
            );
            process.exit(1);
          }
        }

        console.log(`\nServer: http://127.0.0.1:${server.port}`);
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

program.parse();
