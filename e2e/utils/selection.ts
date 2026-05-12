import type { Page } from "@playwright/test";

/**
 * Wait for the Svelte app to be fully mounted and interactive.
 * The app sets data-readit-ready="true" on <html> after onMount.
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.documentElement.dataset.readitReady === "true",
    { timeout: 10_000 },
  );
}

/**
 * Select text within an article element (for markdown documents)
 * Uses custom event to trigger selection handler (workaround for Playwright mouse issues)
 */
export async function selectTextInArticle(
  page: Page,
  textToSelect: string,
): Promise<void> {
  // Ensure the Svelte app is fully mounted before dispatching events
  await waitForAppReady(page);

  // Find text and calculate offsets, then dispatch custom event
  await page.evaluate((text) => {
    const article = document.querySelector("article#document-content");
    if (!article) throw new Error("Article element not found");

    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const content = textNode.textContent || "";
      const index = content.indexOf(text);

      if (index !== -1) {
        const startOffset = currentOffset + index;
        const endOffset = startOffset + text.length;

        // Dispatch custom event that DocumentViewer listens for
        const event = new CustomEvent("test:select-text", {
          detail: { text, startOffset, endOffset },
        });
        window.dispatchEvent(event);
        return;
      }

      currentOffset += content.length;
    }

    throw new Error(`Text "${text}" not found in article`);
  }, textToSelect);

  // Wait for Svelte to process the selection
  await page.waitForTimeout(100);
}

/**
 * Add a comment to the current selection
 * Assumes CommentInputArea is visible
 */
export async function addComment(
  page: Page,
  commentText: string,
): Promise<void> {
  const textarea = page
    .locator('textarea[placeholder="Add your comment..."]')
    .locator("visible=true");
  await textarea.waitFor({ state: "visible", timeout: 10000 });

  await textarea.fill(commentText);

  await page
    .getByRole("button", { name: "Add" })
    .locator("visible=true")
    .click();

  await textarea.waitFor({ state: "hidden", timeout: 5000 });
}
