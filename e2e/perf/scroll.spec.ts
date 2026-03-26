import { test } from "@playwright/test";
import { getFixturePath, TIERS } from "./fixtures/generate";
import {
  collectScrollMetrics,
  reportScrollMetrics,
  waitForHighlightCount,
} from "./utils/metrics";
import { spawnPerfCli } from "./utils/perf-cli";

for (const tier of TIERS) {
  test(`scroll: ${tier.name} (${tier.lines} lines, ${tier.comments} comments)`, async ({
    page,
  }, testInfo) => {
    const fixturePath = getFixturePath(tier);
    const { url, cleanup } = await spawnPerfCli(fixturePath, {
      port: 4610 + TIERS.indexOf(tier),
    });

    try {
      await page.goto(url);

      // Wait for all highlights to be painted before starting scroll
      await waitForHighlightCount(page, tier.comments);

      // Small pause for layout to settle
      await page.waitForTimeout(500);

      const metrics = await collectScrollMetrics(page);

      reportScrollMetrics(
        testInfo,
        `scroll (${tier.name}: ${tier.lines} lines, ${tier.comments} comments)`,
        metrics,
      );
    } finally {
      await cleanup();
    }
  });
}
