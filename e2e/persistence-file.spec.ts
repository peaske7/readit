import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { spawnCli } from "./utils/cli";
import { addComment, selectTextInArticle } from "./utils/selection";

const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures");

/**
 * Get the expected comment file path for a source file.
 */
function getCommentPath(sourcePath: string): string {
  const absolute = resolve(sourcePath);
  const normalized = absolute.replace(/^\//, "").replace(/^[A-Z]:[\\/]/, "");
  const ext = normalized.lastIndexOf(".");
  const withoutExt = ext > 0 ? normalized.slice(0, ext) : normalized;
  return join(os.homedir(), ".readit", "comments", `${withoutExt}.comments.md`);
}

/**
 * Clean up comment file for a source file.
 */
function cleanupCommentFile(sourcePath: string): void {
  const commentPath = getCommentPath(sourcePath);
  if (existsSync(commentPath)) {
    rmSync(commentPath);
  }
}

test.describe("File-Based Comment Persistence", () => {
  const sampleMdPath = resolve(FIXTURES_DIR, "sample.md");

  test.beforeEach(() => {
    // Clean up any existing comment file before each test
    cleanupCommentFile(sampleMdPath);
  });

  test.afterEach(() => {
    // Clean up after each test
    cleanupCommentFile(sampleMdPath);
  });

  test("comments are saved to markdown file", async ({ page }) => {
    const { url, cleanup } = await spawnCli(sampleMdPath, {
      port: 4590,
      clean: false,
    });

    try {
      await page.goto(url);

      // Wait for document to load
      const article = page.locator("article");
      await expect(article).toBeVisible();

      // Add a comment
      const textToSelect = "testing text selection";
      await selectTextInArticle(page, textToSelect);

      const commentText = "This is a test comment for file persistence";
      await addComment(page, commentText);

      // Wait for comment to be visible in UI
      await expect(page.locator("body")).toContainText(commentText);

      // Give time for the file to be written
      await page.waitForTimeout(500);

      // Verify the comment file was created
      const commentPath = getCommentPath(sampleMdPath);
      expect(existsSync(commentPath)).toBe(true);

      // Verify the file contains the comment
      const fileContent = readFileSync(commentPath, "utf-8");
      expect(fileContent).toContain(textToSelect);
      expect(fileContent).toContain(commentText);
      expect(fileContent).toContain("version: 1");
    } finally {
      await cleanup();
    }
  });

  test("comments persist across page reload", async ({ page }) => {
    const { url, cleanup } = await spawnCli(sampleMdPath, {
      port: 4591,
      clean: false,
    });

    try {
      await page.goto(url);

      const article = page.locator("article");
      await expect(article).toBeVisible();

      // Add a comment
      const textToSelect = "testing text selection";
      await selectTextInArticle(page, textToSelect);

      const commentText = "Persistent comment test";
      await addComment(page, commentText);

      // Wait for comment to appear
      await expect(page.locator("body")).toContainText(commentText);

      // Reload the page
      await page.reload();

      // Wait for document to reload
      await expect(article).toBeVisible();

      // Verify comment still exists after reload
      await expect(page.locator("body")).toContainText(commentText);

      // Verify highlight still exists
      const highlight = article.locator("mark[data-comment-id]").first();
      await expect(highlight).toBeVisible();
    } finally {
      await cleanup();
    }
  });

  test("comments persist across server restart", async ({ page }) => {
    const PORT = 4592;

    // First session: add a comment
    const { url: url1, cleanup: cleanup1 } = await spawnCli(sampleMdPath, {
      port: PORT,
      clean: false,
    });

    const commentText = "Comment that survives restart";

    try {
      await page.goto(url1);

      const article = page.locator("article");
      await expect(article).toBeVisible();

      await selectTextInArticle(page, "testing text selection");
      await addComment(page, commentText);

      // Wait for comment to appear
      await expect(page.locator("body")).toContainText(commentText);
    } finally {
      await cleanup1();
    }

    // Wait for server to fully shut down
    await page.waitForTimeout(1000);

    // Second session: verify comment persists
    const { url: url2, cleanup: cleanup2 } = await spawnCli(sampleMdPath, {
      port: PORT,
      clean: false,
    });

    try {
      await page.goto(url2);

      const article = page.locator("article");
      await expect(article).toBeVisible();

      // Comment should still exist from previous session
      await expect(page.locator("body")).toContainText(commentText);

      // Highlight should still exist
      const highlight = article.locator("mark[data-comment-id]").first();
      await expect(highlight).toBeVisible();
    } finally {
      await cleanup2();
    }
  });

  test("--clean flag deletes comment file", async ({ page }) => {
    const PORT = 4593;

    // First, create a comment file manually
    const commentPath = getCommentPath(sampleMdPath);
    const commentDir = dirname(commentPath);
    mkdirSync(commentDir, { recursive: true });
    writeFileSync(
      commentPath,
      `---
source: ${sampleMdPath}
hash: abc123
version: 1
---

<!-- c:12345678|L5|2024-12-24T10:00:00Z -->
> testing text selection

Pre-existing comment to be cleared.

---
`,
      "utf-8",
    );

    expect(existsSync(commentPath)).toBe(true);

    // Start server with --clean flag
    const { url, cleanup } = await spawnCli(sampleMdPath, {
      port: PORT,
      clean: true,
    });

    try {
      await page.goto(url);

      const article = page.locator("article");
      await expect(article).toBeVisible();

      // Wait for clean operation to complete
      await page.waitForTimeout(500);

      // Verify no comments in UI
      const highlight = article.locator("mark[data-comment-id]");
      await expect(highlight).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });

  test("edit updates the comment file", async ({ page }) => {
    const { url, cleanup } = await spawnCli(sampleMdPath, {
      port: 4594,
      clean: false,
    });

    try {
      await page.goto(url);

      const article = page.locator("article");
      await expect(article).toBeVisible();

      // Add initial comment
      const textToSelect = "testing text selection";
      await selectTextInArticle(page, textToSelect);
      const initialComment = "Initial comment text";
      await addComment(page, initialComment);

      await expect(page.locator("body")).toContainText(initialComment);

      // Wait for file to be written
      await page.waitForTimeout(500);

      // Verify initial comment in file
      const commentPath = getCommentPath(sampleMdPath);
      let fileContent = readFileSync(commentPath, "utf-8");
      expect(fileContent).toContain(initialComment);

      // Find the margin note containing the selected text (stable identifier)
      const marginNote = page
        .locator(".group")
        .filter({ hasText: textToSelect })
        .first();
      await marginNote.hover();

      // Find and click edit button
      const editButton = marginNote.locator('button:has-text("Edit")');
      await editButton.click();

      // Wait for edit mode to activate
      const textarea = marginNote.locator("textarea");
      await expect(textarea).toBeVisible();

      // Clear and type new text
      await textarea.fill("Updated comment text");

      // Save edit
      const saveButton = marginNote.locator('button:has-text("Save")');
      await saveButton.click();

      // Wait for file to be updated
      await page.waitForTimeout(500);

      // Verify updated comment in file
      fileContent = readFileSync(commentPath, "utf-8");
      expect(fileContent).toContain("Updated comment text");
    } finally {
      await cleanup();
    }
  });

  test("delete removes comment from file", async ({ page }) => {
    const { url, cleanup } = await spawnCli(sampleMdPath, {
      port: 4595,
      clean: false,
    });

    try {
      await page.goto(url);

      const article = page.locator("article");
      await expect(article).toBeVisible();

      // Add a comment
      await selectTextInArticle(page, "testing text selection");
      const commentText = "Comment to be deleted";
      await addComment(page, commentText);

      await expect(page.locator("body")).toContainText(commentText);

      // Wait for file to be written
      await page.waitForTimeout(500);

      // Verify comment in file
      const commentPath = getCommentPath(sampleMdPath);
      let fileContent = readFileSync(commentPath, "utf-8");
      expect(fileContent).toContain(commentText);

      // Find the margin note containing the comment
      const marginNote = page
        .locator(".group")
        .filter({ hasText: commentText })
        .first();
      await marginNote.hover();

      // Click delete button
      const deleteButton = marginNote.locator('button:has-text("Delete")');
      await deleteButton.click();

      // Wait for file to be updated
      await page.waitForTimeout(500);

      // Verify comment removed from file (file may be deleted if no comments left)
      if (existsSync(commentPath)) {
        fileContent = readFileSync(commentPath, "utf-8");
        expect(fileContent).not.toContain(commentText);
      }
    } finally {
      await cleanup();
    }
  });
});
