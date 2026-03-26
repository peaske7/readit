import { cleanupFixtures } from "./fixtures/generate";

async function globalTeardown() {
  console.log("[perf] Cleaning up fixtures...");
  await cleanupFixtures();
  console.log("[perf] Teardown complete.");
}

export default globalTeardown;
