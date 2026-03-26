import { expect, test } from "@playwright/test";
import { getFixturePath, TIERS } from "./fixtures/generate";
import {
  measureInteraction,
  reportInteraction,
  waitForHighlightCount,
} from "./utils/metrics";
import { spawnPerfCli } from "./utils/perf-cli";

// Use the medium tier — most representative of real usage
const tier = TIERS[0];

test(`add-comment: ${tier.name} (${tier.lines} lines, ${tier.comments} comments)`, async ({
  page,
}, testInfo) => {
  const fixturePath = getFixturePath(tier);
  const { url, cleanup } = await spawnPerfCli(fixturePath, { port: 4620 });

  try {
    await page.goto(url);
    await waitForHighlightCount(page, tier.comments);
    await page.waitForTimeout(300);

    // Find a text that isn't already highlighted — use a line near the end
    const selectionText = await page.evaluate(() => {
      const article = document.querySelector("article");
      if (!article) throw new Error("Article not found");

      // Find paragraph text near the bottom of the document
      const paragraphs = article.querySelectorAll("p");
      const target = paragraphs[paragraphs.length - 2];
      if (!target?.textContent) throw new Error("No paragraph found");

      // Use first 30 chars
      return target.textContent.slice(0, 30).trim();
    });

    // Select text via custom event
    await page.evaluate((text) => {
      const article = document.querySelector("article");
      if (!article) throw new Error("Article not found");

      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      let currentOffset = 0;

      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text;
        const content = textNode.textContent || "";
        const index = content.indexOf(text);

        if (index !== -1) {
          const startOffset = currentOffset + index;
          const endOffset = startOffset + text.length;
          window.dispatchEvent(
            new CustomEvent("test:select-text", {
              detail: { text, startOffset, endOffset },
            }),
          );
          return;
        }

        currentOffset += content.length;
      }

      throw new Error(`Text "${text}" not found`);
    }, selectionText);

    // Wait for comment input to appear
    const textarea = page.locator(
      'textarea[placeholder="Add your comment..."]',
    );
    await textarea.waitFor({ state: "visible", timeout: 10_000 });

    // Fill in the comment
    await textarea.fill("Performance benchmark comment");

    // Mark start and click Add
    const duration = await measureInteraction(
      page,
      "add-comment",
      async () => {
        await page.getByRole("button", { name: "Add" }).click();
      },
      async () => {
        await page.waitForFunction((expected) => {
          const marks = document.querySelectorAll("mark[data-comment-id]");
          const ids = new Set(
            [...marks].map((m) => m.getAttribute("data-comment-id")),
          );
          return ids.size > expected;
        }, tier.comments);
      },
    );

    reportInteraction(
      testInfo,
      `add-comment: time to new highlight (${tier.name})`,
      duration,
    );

    // Verify the highlight actually appeared
    const finalCount = await page.evaluate(() => {
      const marks = document.querySelectorAll("mark[data-comment-id]");
      return new Set([...marks].map((m) => m.getAttribute("data-comment-id")))
        .size;
    });
    expect(finalCount).toBeGreaterThan(tier.comments);
  } finally {
    await cleanup();
  }
});
