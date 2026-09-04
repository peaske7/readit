import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { getCommentPath } from "../src/lib/comment-storage";
import { spawnCli } from "./utils/cli";
import { addComment, waitForAppReady } from "./utils/selection";

// Runs under the "mobile" project (Pixel 7: narrow viewport, touch, no hover).

const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures");
const sampleMdPath = resolve(FIXTURES_DIR, "sample.md");

function cleanupCommentFile(sourcePath: string): void {
  const commentPath = getCommentPath(sourcePath);
  if (existsSync(commentPath)) {
    rmSync(commentPath);
  }
}

/**
 * Select text the way a phone does: the selection changes, but no mouse
 * event ever fires. Nothing here goes through the test-only event hook.
 */
async function touchSelect(page: Page, textToSelect: string): Promise<void> {
  await page.evaluate((text) => {
    const article = document.querySelector("article#document-content");
    if (!article) throw new Error("Article element not found");
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const index = node.data.indexOf(text);
      if (index === -1) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + text.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return;
    }
    throw new Error(`Text "${text}" not found in article`);
  }, textToSelect);
}

test.describe("Phone layout", () => {
  test.beforeEach(() => cleanupCommentFile(sampleMdPath));
  test.afterEach(() => cleanupCommentFile(sampleMdPath));

  test("comments from a touch selection without any mouse event", async ({
    page,
  }) => {
    const { url, cleanup } = await spawnCli(sampleMdPath, { port: 4574 });

    try {
      await page.goto(url);
      await waitForAppReady(page);

      const emulatesTouch = await page.evaluate(
        () => matchMedia("(hover: none)").matches,
      );
      expect(emulatesTouch).toBe(true);

      // The margin column is desktop-only; the phone gets a bottom sheet.
      await expect(page.locator("[data-margin-column]")).toBeHidden();

      await touchSelect(page, "testing text selection");
      const textarea = page
        .locator('textarea[placeholder="Add your comment..."]')
        .locator("visible=true");
      await expect(textarea).toBeVisible();

      // Extending the selection with the handles updates the quoted text.
      await touchSelect(page, "paragraph for testing text selection");
      await expect(
        page
          .getByText('"paragraph for testing text selection"')
          .locator("visible=true"),
      ).toBeVisible();

      await addComment(page, "Read on the train");

      const marker = page.locator("[data-marker-for]").first();
      await expect(marker).toBeVisible();
      await marker.tap();
      const sheetNote = page
        .getByText("Read on the train")
        .locator("visible=true");
      await expect(sheetNote).toHaveCount(1);

      await page.getByRole("button", { name: "Cancel" }).last().tap();
      await expect(sheetNote).toHaveCount(0);

      // A second comment makes the navigator appear, and on touch it must
      // not wait for a hover that will never come.
      await touchSelect(page, "another paragraph");
      await addComment(page, "Second note");
      const nav = page.locator("fieldset > div").first();
      await expect(nav).toBeVisible();
      await expect(nav).toHaveCSS("opacity", "1");

      // Dialogs are sized for a laptop; on a phone they must stay on screen.
      await page.getByTitle("Actions menu").tap();
      await page.getByText("Share…").tap();
      const dialogBox = page.locator("dialog[open] > div");
      await expect(dialogBox).toBeVisible();
      const box = await dialogBox.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
      await page.keyboard.press("Escape");
    } finally {
      await cleanup();
    }
  });
});
