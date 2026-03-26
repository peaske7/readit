import type { Page, TestInfo } from "@playwright/test";

// ─── Types ───────────────────────────────────────────────────────────

export interface LoadMetrics {
  fcp: number | null;
  domContentLoaded: number;
  allHighlightsPainted: number;
  pageReady: number;
  highlightCount: number;
}

export interface ScrollMetrics {
  totalTimeMs: number;
  longTaskCount: number;
  longTaskDurations: number[];
  p50: number;
  p95: number;
  p99: number;
}

export interface InteractionMetrics {
  durationMs: number;
}

// ─── Wait for highlights ─────────────────────────────────────────────

/**
 * Polls the DOM for comment highlights until either:
 * - The expected count is reached, OR
 * - The count stabilizes (no change for `stableMs` milliseconds)
 *
 * Returns the timestamp when highlights finished painting.
 * Not all comments may resolve to highlights (anchor failures, overlaps).
 */
export async function waitForHighlightCount(
  page: Page,
  expectedCount: number,
  timeoutMs = 60_000,
): Promise<number> {
  return page.evaluate(
    ({ expected, timeout, stableWindow }) => {
      return new Promise<number>((resolve, reject) => {
        const deadline = performance.now() + timeout;
        let lastCount = 0;
        let lastChangeTime = performance.now();

        const check = () => {
          // Use the CSS Custom Highlight API observability hook
          const highlights = (window as unknown as Record<string, unknown>)
            .__readitHighlights as { commentIds: string[] } | undefined;
          const count = highlights?.commentIds?.length ?? 0;

          // Exact target reached
          if (count >= expected) {
            resolve(performance.now());
            return;
          }

          // Track changes for stabilization
          if (count !== lastCount) {
            lastCount = count;
            lastChangeTime = performance.now();
          }

          // Stabilized: count hasn't changed for stableWindow ms and we have > 0 highlights
          if (count > 0 && performance.now() - lastChangeTime > stableWindow) {
            resolve(performance.now());
            return;
          }

          if (performance.now() > deadline) {
            reject(
              new Error(
                `Timed out: expected ${expected} highlights, found ${count}`,
              ),
            );
            return;
          }

          requestAnimationFrame(check);
        };

        requestAnimationFrame(check);
      });
    },
    { expected: expectedCount, timeout: timeoutMs, stableWindow: 2000 },
  );
}

// ─── Wait for positions ─────────────────────────────────────────────

/**
 * Waits until Positions.cache() has run AFTER highlights were painted.
 * The `afterTimestamp` ensures we don't capture the initial empty cache()
 * that runs before highlights exist.
 */
async function waitForPositionsReady(
  page: Page,
  afterTimestamp: number,
  timeoutMs = 60_000,
): Promise<number> {
  return page.evaluate(
    ({ after, timeout }) => {
      return new Promise<number>((resolve, reject) => {
        const deadline = performance.now() + timeout;

        const check = () => {
          const ts = (window as unknown as Record<string, unknown>)
            .__readitPositionsReady as number | undefined;

          // Only resolve if positions were computed AFTER highlights painted
          if (ts !== undefined && ts > after) {
            resolve(ts);
            return;
          }

          if (performance.now() > deadline) {
            reject(new Error("Timed out waiting for positions to be ready"));
            return;
          }

          requestAnimationFrame(check);
        };

        requestAnimationFrame(check);
      });
    },
    { after: afterTimestamp, timeout: timeoutMs },
  );
}

// ─── Collect load metrics ────────────────────────────────────────────

/**
 * Navigates to the URL and collects load + highlight timing metrics.
 */
export async function collectLoadMetrics(
  page: Page,
  url: string,
  expectedComments: number,
): Promise<LoadMetrics> {
  await page.goto(url);

  const highlightTimestamp = await waitForHighlightCount(
    page,
    expectedComments,
  );

  // Wait for positions to be computed AFTER highlights
  // (captures the forced reflow cost from getBoundingClientRect)
  const pageReadyTimestamp = await waitForPositionsReady(
    page,
    highlightTimestamp,
  );

  const navMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    const paintEntries = performance.getEntriesByType("paint");
    const fcp = paintEntries.find((e) => e.name === "first-contentful-paint");
    // Use CSS Custom Highlight API observability hook
    const highlights = (window as unknown as Record<string, unknown>)
      .__readitHighlights as { commentIds: string[] } | undefined;
    const actualCount = highlights?.commentIds?.length ?? 0;

    return {
      fcp: fcp ? fcp.startTime : null,
      domContentLoaded: nav.domContentLoadedEventEnd,
      actualCount,
    };
  });

  return {
    fcp: navMetrics.fcp,
    domContentLoaded: navMetrics.domContentLoaded,
    allHighlightsPainted: highlightTimestamp,
    pageReady: pageReadyTimestamp,
    highlightCount: navMetrics.actualCount,
  };
}

// ─── Collect scroll metrics ──────────────────────────────────────────

/**
 * Scrolls programmatically from top to bottom, collecting Long Task entries.
 */
export async function collectScrollMetrics(
  page: Page,
  stepPx = 600,
  intervalMs = 150,
): Promise<ScrollMetrics> {
  return page.evaluate(
    ({ step, interval }) => {
      return new Promise<{
        totalTimeMs: number;
        longTaskCount: number;
        longTaskDurations: number[];
        p50: number;
        p95: number;
        p99: number;
      }>((resolve) => {
        const longTasks: number[] = [];

        // Observe Long Tasks during scroll only (no buffered — excludes page load jank)
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push(entry.duration);
          }
        });
        obs.observe({ type: "longtask" });

        const totalHeight = document.documentElement.scrollHeight;
        const start = performance.now();
        let currentY = 0;

        const scrollStep = () => {
          currentY += step;
          window.scrollTo(0, currentY);

          if (currentY < totalHeight) {
            setTimeout(scrollStep, interval);
          } else {
            // Wait a beat for final Long Tasks to fire
            setTimeout(() => {
              obs.disconnect();
              const elapsed = performance.now() - start;

              const sorted = [...longTasks].sort((a, b) => a - b);
              const pct = (p: number) => {
                if (sorted.length === 0) return 0;
                const idx = Math.ceil((p / 100) * sorted.length) - 1;
                return sorted[Math.max(0, idx)];
              };

              resolve({
                totalTimeMs: elapsed,
                longTaskCount: sorted.length,
                longTaskDurations: sorted,
                p50: pct(50),
                p95: pct(95),
                p99: pct(99),
              });
            }, 500);
          }
        };

        // Start scrolling
        window.scrollTo(0, 0);
        setTimeout(scrollStep, interval);
      });
    },
    { step: stepPx, interval: intervalMs },
  );
}

// ─── Measure interaction timing ──────────────────────────────────────

/**
 * Sets a performance mark, runs the trigger, waits for condition, returns duration.
 */
export async function measureInteraction(
  page: Page,
  name: string,
  trigger: () => Promise<void>,
  waitFor: () => Promise<void>,
): Promise<number> {
  await page.evaluate((n) => performance.mark(`${n}-start`), name);

  await trigger();
  await waitFor();

  return page.evaluate((n) => {
    performance.mark(`${n}-end`);
    const measure = performance.measure(n, `${n}-start`, `${n}-end`);
    return measure.duration;
  }, name);
}

// ─── Reporting ───────────────────────────────────────────────────────

export function reportLoadMetrics(
  testInfo: TestInfo,
  label: string,
  metrics: LoadMetrics,
): void {
  const lines = [
    `--- ${label} ---`,
    `  FCP:                    ${metrics.fcp !== null ? `${Math.round(metrics.fcp)}ms` : "N/A"}`,
    `  DOM Content Loaded:     ${Math.round(metrics.domContentLoaded)}ms`,
    `  All highlights painted: ${Math.round(metrics.allHighlightsPainted)}ms`,
    `  Page ready (+ layout):  ${Math.round(metrics.pageReady)}ms`,
    `  Highlights found:       ${metrics.highlightCount}`,
  ];
  console.log(lines.join("\n"));

  testInfo.annotations.push({
    type: "perf-metric",
    description: JSON.stringify({ label, ...metrics }),
  });
}

export function reportScrollMetrics(
  testInfo: TestInfo,
  label: string,
  metrics: ScrollMetrics,
): void {
  const lines = [
    `--- ${label} ---`,
    `  Total scroll time:    ${Math.round(metrics.totalTimeMs)}ms`,
    `  Long tasks (>50ms):   ${metrics.longTaskCount}`,
    `  P50 long task:        ${Math.round(metrics.p50)}ms`,
    `  P95 long task:        ${Math.round(metrics.p95)}ms`,
    `  P99 long task:        ${Math.round(metrics.p99)}ms`,
  ];
  console.log(lines.join("\n"));

  testInfo.annotations.push({
    type: "perf-metric",
    description: JSON.stringify({ label, ...metrics }),
  });
}

export function reportInteraction(
  testInfo: TestInfo,
  label: string,
  durationMs: number,
): void {
  console.log(`--- ${label} ---`);
  console.log(`  Duration: ${Math.round(durationMs)}ms`);

  testInfo.annotations.push({
    type: "perf-metric",
    description: JSON.stringify({ label, durationMs }),
  });
}
