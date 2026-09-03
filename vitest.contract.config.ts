import { defineConfig } from "vitest/config";

/**
 * The cross-server contract suite (docs/api-contract.md). Separate from
 * vitest.config.ts because it drives real servers over HTTP: node environment,
 * no jsdom setup, and one server at a time.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/contract/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
