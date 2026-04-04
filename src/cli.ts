#!/usr/bin/env bun

import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
import open from "open";
import { getCommentPath, parseCommentFile } from "./lib/comment-storage.js";
import { isMarkdownFile } from "./lib/utils.js";
import type { FileEntry } from "./server.js";
import { removeServerInfo, startServer } from "./server.js";

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

interface ServerTarget {
  kind: "existing" | "started";
  port: number;
  url: string;
  server?: { stop(): void };
}

const READIT_DIR = join(os.homedir(), ".readit");
const SERVER_INFO_PATH = join(READIT_DIR, "server.json");
const SERVER_LOCK_PATH = join(READIT_DIR, "server.lock");
const SERVER_LOCK_MAX_AGE_MS = 30_000;
const SERVER_LOCK_TIMEOUT_MS = 10_000;
const SERVER_LOCK_WAIT_MS = 100;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getErrnoCode(err: unknown): string | undefined {
  return err instanceof Error && "code" in err
    ? (err as NodeJS.ErrnoException).code
    : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clearStaleServerLock(): Promise<void> {
  try {
    const [stats, content] = await Promise.all([
      fs.stat(SERVER_LOCK_PATH),
      fs.readFile(SERVER_LOCK_PATH, "utf-8").catch(() => ""),
    ]);

    const age = Date.now() - stats.mtimeMs;
    let pid: number | undefined;

    if (content) {
      try {
        const lock = JSON.parse(content) as { pid?: number };
        pid = lock.pid;
      } catch {}
    }

    if (age > SERVER_LOCK_MAX_AGE_MS || (pid !== undefined && !isAlive(pid))) {
      await fs.unlink(SERVER_LOCK_PATH).catch(() => {});
    }
  } catch (err) {
    if (getErrnoCode(err) !== "ENOENT") throw err;
  }
}

async function withServerLock<T>(run: () => Promise<T>): Promise<T> {
  await fs.mkdir(READIT_DIR, { recursive: true });
  const start = Date.now();

  while (true) {
    let handle: fs.FileHandle | undefined;

    try {
      handle = await fs.open(SERVER_LOCK_PATH, "wx");
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
        "utf-8",
      );

      try {
        return await run();
      } finally {
        await handle.close().catch(() => {});
        await fs.unlink(SERVER_LOCK_PATH).catch(() => {});
      }
    } catch (err) {
      if (handle) {
        await handle.close().catch(() => {});
      }

      if (getErrnoCode(err) !== "EEXIST") {
        throw err;
      }

      await clearStaleServerLock();

      if (Date.now() - start >= SERVER_LOCK_TIMEOUT_MS) {
        throw new Error("Timed out waiting for readit server lock");
      }

      await sleep(SERVER_LOCK_WAIT_MS);
    }
  }
}

async function discoverServer(): Promise<ServerInfo | null> {
  try {
    const content = readFileSync(SERVER_INFO_PATH, "utf-8");
    const info: ServerInfo = JSON.parse(content);

    if (!isAlive(info.pid)) {
      return null;
    }

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

async function attachFiles(
  server: ServerInfo,
  files: { path: string }[],
): Promise<void> {
  for (const file of files) {
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: file.path }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error(`error: failed to add ${file.path}: ${data.error}`);
        process.exit(1);
      }

      const data = await res.json();
      if (data.status === "added") {
        console.log(`Added: ${data.fileName}`);
      } else {
        console.log(`Present: ${data.fileName}`);
      }
    } catch (err) {
      console.error(
        "error: failed to connect to server:",
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  }
}

async function getServerTarget(
  files: FileEntry[],
  port: number,
  host: string,
): Promise<ServerTarget> {
  return withServerLock(async () => {
    const server = await discoverServer();
    if (server) {
      return {
        kind: "existing",
        port: server.port,
        url: `http://127.0.0.1:${server.port}`,
      };
    }

    const started = await startServer({ files, port, host });
    return {
      kind: "started",
      port: started.port,
      url: started.url,
      server: started.server,
    };
  });
}

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

function findReviewableFiles(dir: string): FileEntry[] {
  const results: FileEntry[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules") continue;

      const fullPath = join(dir, entry);
      try {
        const lstat = lstatSync(fullPath);
        if (lstat.isSymbolicLink()) continue;
        if (lstat.isDirectory()) {
          results.push(...findReviewableFiles(fullPath));
        } else if (isMarkdownFile(entry)) {
          results.push({ filePath: fullPath });
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

function resolveFiles(args: string[]): FileEntry[] {
  const seen = new Set<string>();
  const files: FileEntry[] = [];

  for (const arg of args) {
    const inputPath = resolve(process.cwd(), arg);

    if (!existsSync(inputPath)) {
      console.error(`error: not found: ${inputPath}`);
      process.exit(1);
    }

    const filePath = realpathSync(inputPath);

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

      if (!isMarkdownFile(filePath)) {
        console.error(
          `error: unsupported file type: ${arg} (expected .md or .markdown)`,
        );
        process.exit(1);
      }

      seen.add(filePath);
      files.push({ filePath });
    }
  }

  return files;
}

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
  } catch {}
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

program
  .name("readit")
  .description("Review Markdown documents with inline comments")
  .version("0.2.0");

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
      } catch {}
    }
  });

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

program
  .argument("[files...]", "Markdown files/directories to review")
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

      let previousPort: number | undefined;
      try {
        const info = JSON.parse(readFileSync(SERVER_INFO_PATH, "utf-8"));
        if (!isAlive(info.pid)) {
          previousPort = info.port;
        }
      } catch {}

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
          const fileList = files.map((f) => `  ${f.filePath}`);

          console.log(`
readit - Document Review Tool

  ${files.length === 1 ? "File:" : "Files:"}
${fileList.join("\n")}
  URL:  ${url}

  Server running. Close browser tab to stop.
  Press Ctrl+C to force stop.
`);
        }

        const browserLikelyOpen =
          previousPort === preferredPort ||
          process.env.NODE_ENV === "development";

        if (options.open && !browserLikelyOpen) {
          open(url);
        }

        if (fileArgs.length === 0) {
          await markOnboarded();
        }

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

program
  .command("open")
  .argument("<files...>", "Markdown files to add to running server")
  .description("Add files to a running readit server, or start a new one")
  .option("-p, --port <number>", "Port for new server (if starting)", "4567")
  .option("--host <address>", "Host for new server (if starting)", "127.0.0.1")
  .action(
    async (fileArgs: string[], options: { port: string; host: string }) => {
      const resolvedFiles: { path: string }[] = [];
      for (const arg of fileArgs) {
        const inputPath = resolve(process.cwd(), arg);

        if (!existsSync(inputPath)) {
          console.error(`error: not found: ${inputPath}`);
          process.exit(1);
        }

        const filePath = realpathSync(inputPath);

        if (!isMarkdownFile(filePath)) {
          console.error(
            `error: unsupported file type: ${arg} (expected .md or .markdown)`,
          );
          process.exit(1);
        }

        resolvedFiles.push({ path: filePath });
      }

      const files = resolvedFiles.map((f) => ({
        filePath: f.path,
      }));

      const preferredPort = Number.parseInt(options.port, 10);
      try {
        const target = await getServerTarget(
          files,
          preferredPort,
          options.host,
        );

        if (target.kind === "existing") {
          await attachFiles(
            { port: target.port, pid: process.pid },
            resolvedFiles,
          );
          console.log(`\nServer: ${target.url}`);
          return;
        }

        const fileList = files.map((f) => `  ${f.filePath}`);
        console.log(`
readit - Document Review Tool

  ${files.length === 1 ? "File:" : "Files:"}
${fileList.join("\n")}
  URL:  ${target.url}

  Server running. Close browser tab to stop.
  Press Ctrl+C to force stop.
`);

        open(target.url);

        process.on("SIGINT", async () => {
          console.log("\n\nShutting down...");
          target.server?.stop();
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

program
  .command("completion")
  .argument("[shell]", "Shell type (zsh, bash, fish)", "zsh")
  .description("Output shell completion and integration script")
  .action((shell: string) => {
    const shellDir = join(import.meta.dir, "..", "shell");

    switch (shell) {
      case "zsh": {
        // Output the full zsh integration (completions + @ file picker widget)
        const widgetPath = join(shellDir, "readit.zsh");
        const compPath = join(shellDir, "_readit");

        if (!existsSync(widgetPath) || !existsSync(compPath)) {
          // Fallback: output inline minimal completion
          console.log(generateInlineZshCompletion());
          return;
        }

        console.log("# readit shell integration for zsh");
        console.log('# Add to your .zshrc: eval "$(readit completion zsh)"');
        console.log();
        console.log(readFileSync(widgetPath, "utf-8"));
        break;
      }
      case "bash":
        console.log(generateBashCompletion());
        break;
      case "fish":
        console.log(generateFishCompletion());
        break;
      default:
        console.error(`error: unsupported shell: ${shell}`);
        console.error("Supported shells: zsh, bash, fish");
        process.exit(1);
    }
  });

program.parse();

function generateInlineZshCompletion(): string {
  return `
#compdef readit

_readit_markdown_files() {
  local -a files
  files=( \${(f)"\$(find . -type f \\( -name '*.md' -o -name '*.markdown' \\) -not -path '*/\\.*' -not -path '*/node_modules/*' 2>/dev/null | sed 's|^\\./||')"} )
  _describe -t files 'markdown files' files
}

_readit() {
  local context state state_descr line
  typeset -A opt_args
  _arguments -C '1:command:->cmd_or_files' '*::arg:->args'
  case "$state" in
    cmd_or_files)
      local -a commands=(
        'open:Add files to running server'
        'list:List files with comments'
        'show:Show comments for a file'
        'completion:Output shell completion script'
      )
      _alternative 'commands:command:compadd -a commands' 'files:markdown file:_readit_markdown_files'
      ;;
    args)
      case "\${line[1]}" in
        open) _arguments '*:file:_readit_markdown_files' ;;
        show) _arguments '1:file:_files -g "*.md *.markdown"' ;;
        *) _arguments '*:file:_readit_markdown_files' ;;
      esac
      ;;
  esac
}
_readit "$@"
`.trim();
}

function generateBashCompletion(): string {
  return `
# readit bash completion
# Add to .bashrc: eval "$(readit completion bash)"

_readit_completions() {
  local cur prev commands
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="open list show completion"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( \$(compgen -W "\${commands}" -- "\${cur}") )
    # Also complete markdown files
    local files=\$(find . -type f \\( -name '*.md' -o -name '*.markdown' \\) \\
      -not -path '*/.*' -not -path '*/node_modules/*' 2>/dev/null | sed 's|^\\./||')
    COMPREPLY+=( \$(compgen -W "\${files}" -- "\${cur}") )
    return 0
  fi

  case "\${COMP_WORDS[1]}" in
    open|show)
      local files=\$(find . -type f \\( -name '*.md' -o -name '*.markdown' \\) \\
        -not -path '*/.*' -not -path '*/node_modules/*' 2>/dev/null | sed 's|^\\./||')
      COMPREPLY=( \$(compgen -W "\${files}" -- "\${cur}") )
      ;;
    completion)
      COMPREPLY=( \$(compgen -W "zsh bash fish" -- "\${cur}") )
      ;;
  esac
  return 0
}

complete -F _readit_completions readit
`.trim();
}

function generateFishCompletion(): string {
  return `
# readit fish completion
# Add to config.fish: readit completion fish | source

# Disable file completions by default
complete -c readit -f

# Subcommands
complete -c readit -n '__fish_use_subcommand' -a 'open' -d 'Add files to running server'
complete -c readit -n '__fish_use_subcommand' -a 'list' -d 'List files with comments'
complete -c readit -n '__fish_use_subcommand' -a 'show' -d 'Show comments for a file'
complete -c readit -n '__fish_use_subcommand' -a 'completion' -d 'Output shell completion script'

# Options
complete -c readit -s p -l port -d 'Port to run server on'
complete -c readit -l host -d 'Host address to bind to'
complete -c readit -l no-open -d 'Don\\'t automatically open browser'
complete -c readit -l clean -d 'Clear existing comments'

# File arguments for default command and open
complete -c readit -n '__fish_use_subcommand' -F -a '(find . -type f \\( -name "*.md" -o -name "*.markdown" \\) -not -path "*/.*" -not -path "*/node_modules/*" 2>/dev/null | sed "s|^\\./||")'
complete -c readit -n '__fish_seen_subcommand_from open' -F -a '(find . -type f \\( -name "*.md" -o -name "*.markdown" \\) -not -path "*/.*" -not -path "*/node_modules/*" 2>/dev/null | sed "s|^\\./||")'
complete -c readit -n '__fish_seen_subcommand_from show' -F -a '(find . -type f \\( -name "*.md" -o -name "*.markdown" \\) -not -path "*/.*" -not -path "*/node_modules/*" 2>/dev/null | sed "s|^\\./||")'

# Shell completions for completion subcommand
complete -c readit -n '__fish_seen_subcommand_from completion' -a 'zsh bash fish'
`.trim();
}
