import { existsSync, rmSync } from "node:fs";
import * as os from "node:os";
import { join, resolve } from "node:path";
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

test.describe("Comment Creation", () => {
  const sampleMdPath = resolve(FIXTURES_DIR, "sample.md");

  test.beforeEach(() => {
    cleanupCommentFile(sampleMdPath);
  });

  test.afterEach(() => {
    cleanupCommentFile(sampleMdPath);
  });

  test("adds comment to selected text in markdown document", async ({
    page,
  }) => {
    const { url, cleanup } = await spawnCli(sampleMdPath, { port: 4572 });

    try {
      await page.goto(url);

      // Wait for document to load
      const article = page.locator("article#document-content");
      await expect(article).toBeVisible();

      // Select text in the article
      const textToSelect = "testing text selection";
      await selectTextInArticle(page, textToSelect);

      // Add a comment
      const commentText = "This is my test comment";
      await addComment(page, commentText);

      // Verify: highlight exists via CSS Custom Highlight API observability hook
      await page.waitForFunction(
        () => {
          const h = (window as unknown as Record<string, unknown>)
            .__readitHighlights as { commentIds: string[] } | undefined;
          return h && h.commentIds.length > 0;
        },
        { timeout: 10_000 },
      );

      // Verify the selected text is still visible in the article
      await expect(article).toContainText(textToSelect);

      // Verify: margin note shows the comment
      await expect(page.locator("body")).toContainText(commentText);
    } finally {
      await cleanup();
    }
  });
});
