import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Runs the Worker's tests in workerd with miniflare's simulated R2, so R2,
 * WebCrypto, and the request plumbing behave as they do on deploy.
 *
 * Bindings are declared here rather than read from wrangler.toml: the tests
 * need neither the static-asset directory (a build output) nor the rate
 * limiter, and they pass stubs for both. Keep the compatibility settings in
 * step with wrangler.toml.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: "2026-08-15",
        compatibilityFlags: ["nodejs_compat"],
        r2Buckets: ["SHARES"],
        bindings: {
          PUBLISH_TOKEN: "test-publish-token",
          COOKIE_SECRET: "test-cookie-secret",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/manifest-setup.ts"],
  },
});
