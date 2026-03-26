import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { generateFixtures } from "./fixtures/generate";

async function globalSetup() {
  // Build the app if dist doesn't exist
  const distIndex = resolve(import.meta.dirname, "../../dist/index.js");
  if (!existsSync(distIndex)) {
    console.log("[perf] Building app...");
    execFileSync("bun", ["run", "build"], {
      cwd: resolve(import.meta.dirname, "../.."),
      stdio: "inherit",
    });
  }

  // Generate fixture files and comment files
  console.log("[perf] Generating fixtures...");
  await generateFixtures();
  console.log("[perf] Setup complete.");
}

export default globalSetup;
