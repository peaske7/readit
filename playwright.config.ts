import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // Run sequentially to avoid port conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker to avoid port conflicts
  reporter: "html",
  timeout: 30_000,

  use: {
    trace: "on-first-retry",
  },

  globalSetup: process.env.PERF_SETUP ? "./e2e/perf/perf.setup.ts" : undefined,
  globalTeardown: process.env.PERF_SETUP
    ? "./e2e/perf/perf.teardown.ts"
    : undefined,

  projects: [
    {
      name: "chromium",
      testIgnore: "**/perf/**",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "perf",
      testDir: "./e2e/perf",
      timeout: 120_000,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
