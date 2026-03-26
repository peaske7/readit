import { test } from "@playwright/test";
import { getFixturePath, TIERS } from "./fixtures/generate";
import {
  measureInteraction,
  reportInteraction,
  waitForHighlightCount,
} from "./utils/metrics";
import { spawnPerfCli } from "./utils/perf-cli";

// Use medium tier
const tier = TIERS[0];
const ITERATIONS = 5;

test(`text-selection: ${tier.name} (${tier.lines} lines, ${tier.comments} comments)`, async ({
  page,
}, testInfo) => {
  const fixturePath = getFixturePath(tier);
  const { url, cleanup } = await spawnPerfCli(fixturePath, { port: 4630 });

  try {
    await page.goto(url);
    await waitForHighlightCount(page, tier.comments);
    await page.waitForTimeout(300);

    // Collect selectable text positions distributed across the document
    const targets = await page.evaluate((count) => {
      const article = document.querySelector("article");
      if (!article) throw new Error("Article not found");

      const paragraphs = [...article.querySelectorAll("p")];
      const step = Math.floor(paragraphs.length / (count + 1));

      return paragraphs
        .filter((_, i) => i % step === 0)
        .slice(0, count)
        .map((p) => {
          const text = (p.textContent || "").slice(0, 25).trim();
          return text;
        })
        .filter((t) => t.length > 10);
    }, ITERATIONS);

    const durations: number[] = [];

    for (const targetText of targets) {
      // Clear any existing selection state
      await page.evaluate(() => window.getSelection()?.removeAllRanges());
      await page.waitForTimeout(100);

      const duration = await measureInteraction(
        page,
        `text-selection-${targets.indexOf(targetText)}`,
        async () => {
          // Trigger text selection via custom event
          await page.evaluate((text) => {
            const article = document.querySelector("article");
            if (!article) throw new Error("Article not found");

            const walker = document.createTreeWalker(
              article,
              NodeFilter.SHOW_TEXT,
            );
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
          }, targetText);
        },
        async () => {
          // Wait for comment input textarea to appear
          await page
            .locator('textarea[placeholder="Add your comment..."]')
            .waitFor({ state: "visible", timeout: 10_000 });
        },
      );

      durations.push(duration);

      // Cancel the selection (press Escape to dismiss the comment input)
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    }

    // Report median
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)];

    reportInteraction(
      testInfo,
      `text-selection: median of ${durations.length} iterations (${tier.name})`,
      median,
    );

    // Also report all iterations
    console.log(
      `  All iterations: ${durations.map((d) => `${Math.round(d)}ms`).join(", ")}`,
    );
  } finally {
    await cleanup();
  }
});
