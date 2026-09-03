/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { Env as WorkerEnv } from "../src/env";

declare global {
  /** `cloudflare:test` types `env` as Cloudflare.Env; give it our bindings. */
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
