import { test } from "@playwright/test";
import { getFixturePath, TAB_SWITCH_TIER, TIERS } from "./fixtures/generate";
import {
  measureInteraction,
  reportInteraction,
  waitForHighlightCount,
} from "./utils/metrics";
import { spawnPerfCli } from "./utils/perf-cli";

const tierA = TIERS[0]; // medium
const tierB = TAB_SWITCH_TIER; // medium-b

test(`tab-switch: between two ${tierA.name} documents`, async ({
  page,
}, testInfo) => {
  const pathA = getFixturePath(tierA);
  const pathB = getFixturePath(tierB);

  const { url, cleanup } = await spawnPerfCli([pathA, pathB], { port: 4640 });

  try {
    await page.goto(url);

    // Wait for first document to be fully loaded with highlights
    await waitForHighlightCount(page, tierA.comments);
    await page.waitForTimeout(500);

    // Find the second tab and measure the switch
    const duration = await measureInteraction(
      page,
      "tab-switch",
      async () => {
        // Click the second tab — tabs display file names
        const tabs = page.locator('[role="tab"], button').filter({
          hasText: tierB.fileName.replace(".md", ""),
        });

        // If tabs aren't labeled with role="tab", find by filename text
        const tabCount = await tabs.count();
        if (tabCount > 0) {
          await tabs.first().click();
        } else {
          // Fallback: find any clickable element containing the filename
          const allButtons = page.locator("button, a");
          const count = await allButtons.count();
          for (let i = 0; i < count; i++) {
            const text = await allButtons.nth(i).textContent();
            if (text?.includes("medium-b")) {
              await allButtons.nth(i).click();
              break;
            }
          }
        }
      },
      async () => {
        // Wait for the second document's highlights to paint
        await waitForHighlightCount(page, tierB.comments, 60_000);
      },
    );

    reportInteraction(
      testInfo,
      `tab-switch: ${tierA.name} → ${tierB.name} (${tierA.comments} → ${tierB.comments} comments)`,
      duration,
    );
  } finally {
    await cleanup();
  }
});
