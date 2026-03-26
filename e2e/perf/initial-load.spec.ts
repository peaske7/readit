import { test } from "@playwright/test";
import { getFixturePath, TIERS } from "./fixtures/generate";
import { collectLoadMetrics, reportLoadMetrics } from "./utils/metrics";
import { spawnPerfCli } from "./utils/perf-cli";

const ITERATIONS = 3;

for (const tier of TIERS) {
  test(`initial-load: ${tier.name} (${tier.lines} lines, ${tier.comments} comments)`, async ({
    page,
  }, testInfo) => {
    const fixturePath = getFixturePath(tier);
    const { url, cleanup } = await spawnPerfCli(fixturePath, {
      port: 4600 + TIERS.indexOf(tier),
    });

    try {
      const results: (typeof collected)[] = [];
      let collected!: Awaited<ReturnType<typeof collectLoadMetrics>>;

      for (let i = 0; i < ITERATIONS; i++) {
        // Clear performance entries between iterations
        if (i > 0) {
          await page.evaluate(() => performance.clearResourceTimings());
        }

        collected = await collectLoadMetrics(page, url, tier.comments);
        results.push(collected);

        // Navigate away between iterations to force full reload
        if (i < ITERATIONS - 1) {
          await page.goto("about:blank");
        }
      }

      // Report median
      results.sort((a, b) => a.allHighlightsPainted - b.allHighlightsPainted);
      const median = results[Math.floor(results.length / 2)];

      reportLoadMetrics(
        testInfo,
        `initial-load (${tier.name}: ${tier.lines} lines, ${tier.comments} comments)`,
        median,
      );
    } finally {
      await cleanup();
    }
  });
}
