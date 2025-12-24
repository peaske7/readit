#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
import open from "open";
import { getCommentPath, parseCommentFile } from "../lib/comment-storage.js";
import { startServer } from "../server/index.js";
import type { DocumentType } from "../types/index.js";

const program = new Command();

function getFileType(filePath: string): DocumentType | null {
  if (filePath.endsWith(".md") || filePath.endsWith(".markdown")) {
    return "markdown";
  }
  if (filePath.endsWith(".html") || filePath.endsWith(".htm")) {
    return "html";
  }
  return null;
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
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          results.push(...findCommentFiles(fullPath));
        } else if (entry.endsWith(".comments.md")) {
          results.push(fullPath);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible directories
  }

  return results;
}

program
  .name("readit")
  .description("Review Markdown and HTML documents with inline comments")
  .version("0.1.0");

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
        `Error reading comments:`,
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  });

// Main review command (default)
program
  .argument("<file>", "Markdown or HTML file to review")
  .option("-p, --port <number>", "Port to run server on", "4567")
  .option("--host <address>", "Host address to bind to", "127.0.0.1")
  .option("--no-open", "Don't automatically open browser")
  .option("--clean", "Clear all existing comments on startup")
  .action(
    async (
      file: string,
      options: {
        port: string;
        host: string;
        open: boolean;
        clean: boolean;
      },
    ) => {
      const filePath = resolve(process.cwd(), file);

      if (!existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }

      const fileType = getFileType(file);
      if (!fileType) {
        console.error(
          "Error: File must be a Markdown (.md, .markdown) or HTML (.html, .htm) file",
        );
        process.exit(1);
      }

      const content = readFileSync(filePath, "utf-8");
      const preferredPort = Number.parseInt(options.port, 10);

      if (
        Number.isNaN(preferredPort) ||
        preferredPort < 1 ||
        preferredPort > 65535
      ) {
        console.error(`Error: Invalid port number: ${options.port}`);
        process.exit(1);
      }

      try {
        const { url, server } = await startServer({
          content,
          type: fileType,
          filePath,
          port: preferredPort,
          host: options.host,
          clean: options.clean,
        });

        console.log(`
readit - Document Review Tool

  File: ${filePath}
  Type: ${fileType}
  URL:  ${url}

  Server running. Close browser tab to stop.
  Press Ctrl+C to force stop.
`);

        if (options.open) {
          open(url);
        }

        // Graceful shutdown on Ctrl+C
        process.on("SIGINT", () => {
          console.log("\n\nShutting down...");
          server.close();
          process.exit(0);
        });
      } catch (error) {
        console.error(
          "Error starting server:",
          error instanceof Error ? error.message : error,
        );
        process.exit(1);
      }
    },
  );

program.parse();
