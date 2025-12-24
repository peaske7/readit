import type { FrameLocator, Page } from "@playwright/test";

/**
 * Select text within an article element (for markdown documents)
 * Uses custom event to trigger selection handler (workaround for Playwright mouse issues)
 */
export async function selectTextInArticle(
  page: Page,
  textToSelect: string,
): Promise<void> {
  // Find text and calculate offsets, then dispatch custom event
  await page.evaluate((text) => {
    const article = document.querySelector("article");
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

  // Wait for React to process the selection
  await page.waitForTimeout(100);
}

/**
 * Select text within an iframe (for HTML documents)
 * Uses custom event to trigger selection handler (same as markdown)
 */
export async function selectTextInIframe(
  page: Page,
  _iframe: FrameLocator,
  textToSelect: string,
): Promise<void> {
  // Get the actual frame object for evaluation
  const frame = page.frame({ url: /^about:srcdoc/ }) || page.frames()[1];
  if (!frame) throw new Error("Could not find iframe frame");

  // Calculate offsets in iframe, then dispatch custom event to parent
  const offsets = await frame.evaluate((text) => {
    const body = document.body;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      const content = textNode.textContent || "";
      const index = content.indexOf(text);

      if (index !== -1) {
        const startOffset = currentOffset + index;
        const endOffset = startOffset + text.length;
        return { text, startOffset, endOffset };
      }

      currentOffset += content.length;
    }

    throw new Error(`Text "${text}" not found in iframe`);
  }, textToSelect);

  // Dispatch custom event to parent window (IframeContainer listens for this)
  await page.evaluate((detail) => {
    const event = new CustomEvent("test:select-text", { detail });
    window.dispatchEvent(event);
  }, offsets);

  // Wait for React to process state update
  await page.waitForTimeout(200);

  // Manually send applyHighlights to iframe (workaround for isReadyRef timing)
  // This ensures the iframe gets the highlight even if React's useEffect hasn't fired
  await page.evaluate(
    (selection) => {
      const iframe = document.querySelector("iframe");
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: "applyHighlights",
            comments: [],
            pendingSelection: selection,
          },
          "*",
        );
      }
    },
    { startOffset: offsets.startOffset, endOffset: offsets.endOffset },
  );

  // Wait for iframe to apply highlights
  await page.waitForTimeout(200);
}

/**
 * Add a comment to the current selection
 * Assumes CommentInputArea is visible
 */
export async function addComment(
  page: Page,
  commentText: string,
): Promise<void> {
  // Wait for the comment input textarea to appear
  // Give more time for iframe postMessage round-trip
  const textarea = page.locator('textarea[placeholder="Add your comment..."]');
  await textarea.waitFor({ state: "visible", timeout: 10000 });

  // Fill in the comment
  await textarea.fill(commentText);

  // Click the Add button
  await page.getByRole("button", { name: "Add" }).click();

  // Wait for the textarea to disappear (comment submitted)
  await textarea.waitFor({ state: "hidden", timeout: 5000 });
}
