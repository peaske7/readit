import { existsSync, rmSync } from "node:fs";
import * as os from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { spawnCli } from "./utils/cli";
import {
  addComment,
  selectTextInArticle,
  selectTextInIframe,
} from "./utils/selection";

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

test.describe("Comment Creation", () => {
  const sampleMdPath = resolve(FIXTURES_DIR, "sample.md");
  const sampleHtmlPath = resolve(FIXTURES_DIR, "sample.html");

  test.beforeEach(() => {
    // Clean up any existing comment files before each test
    cleanupCommentFile(sampleMdPath);
    cleanupCommentFile(sampleHtmlPath);
  });

  test.afterEach(() => {
    // Clean up after each test
    cleanupCommentFile(sampleMdPath);
    cleanupCommentFile(sampleHtmlPath);
  });

  test("adds comment to selected text in markdown document", async ({
    page,
  }) => {
    const { url, cleanup } = await spawnCli(sampleMdPath, { port: 4572 });

    try {
      await page.goto(url);

      // Wait for document to load
      const article = page.locator("article");
      await expect(article).toBeVisible();

      // Select text in the article
      const textToSelect = "testing text selection";
      await selectTextInArticle(page, textToSelect);

      // Add a comment
      const commentText = "This is my test comment";
      await addComment(page, commentText);

      // Verify: highlight exists with data-comment-id
      const highlight = article.locator("mark[data-comment-id]").first();
      await expect(highlight).toBeVisible();
      await expect(highlight).toContainText(textToSelect);

      // Verify: margin note shows the comment
      await expect(page.locator("body")).toContainText(commentText);
    } finally {
      await cleanup();
    }
  });

  test("adds comment to selected text in HTML document (iframe)", async ({
    page,
  }) => {
    const { url, cleanup } = await spawnCli(sampleHtmlPath, { port: 4573 });

    try {
      await page.goto(url);

      // Wait for iframe to load and its script to initialize
      const iframe = page.frameLocator("iframe");
      await expect(iframe.locator("body")).toBeVisible();

      // Wait for iframe script to execute and send iframeReady
      await page.waitForTimeout(500);

      // Select text inside iframe - use test event which bypasses tree walking
      // The test event directly sends offsets to the parent
      const textToSelect = "testing text selection";
      await selectTextInIframe(page, iframe, textToSelect);

      // Verify pending highlight exists in iframe
      const pendingMark = iframe.locator("mark[data-pending]");
      await expect(pendingMark).toBeVisible({ timeout: 5000 });

      // Add a comment (input is in parent frame)
      const commentText = "Comment on HTML content";
      await addComment(page, commentText);

      // Wait for the comment to be saved via API and highlights to be applied
      await page.waitForTimeout(500);

      // Verify: highlight exists inside iframe with comment ID
      const highlight = iframe.locator("mark[data-comment-id]").first();
      await expect(highlight).toBeVisible();
      await expect(highlight).toContainText(textToSelect);

      // Verify: margin note shows the comment (in parent frame)
      await expect(page.locator("body")).toContainText(commentText);
    } finally {
      await cleanup();
    }
  });
});
