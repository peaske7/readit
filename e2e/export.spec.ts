import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { spawnCli } from "./utils/cli";
import { addComment, selectTextInArticle } from "./utils/selection";

const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures");

test.describe("Comment Export", () => {
  test("Copy All generates valid prompt format", async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    const { url, cleanup } = await spawnCli(
      resolve(FIXTURES_DIR, "sample.md"),
      { port: 4590 },
    );

    try {
      await page.goto(url);

      // Wait for document to load
      const article = page.locator("article");
      await expect(article).toBeVisible();

      // Add a comment
      const textToSelect = "testing text selection";
      const commentText = "This is my review comment";
      await selectTextInArticle(page, textToSelect);
      await addComment(page, commentText);

      // Verify comment was added
      await expect(page.locator("body")).toContainText(commentText);

      // Open the actions menu and click "Copy All"
      const menuButton = page.getByRole("button", { name: /actions menu/i });
      await menuButton.click();

      const copyButton = page.getByRole("menuitem", { name: /copy all/i });
      await copyButton.click();

      // Read clipboard content
      const clipboardContent = await page.evaluate(() =>
        navigator.clipboard.readText(),
      );

      // Verify the format contains expected parts
      expect(clipboardContent).toContain("# Review Comments for sample.md");
      expect(clipboardContent).toContain(textToSelect);
      expect(clipboardContent).toContain(commentText);

      // Verify it follows the prompt format (selected text + comment structure)
      expect(clipboardContent).toContain("Selected text:");
      expect(clipboardContent).toContain("Comment:");
    } finally {
      await cleanup();
    }
  });
});
