import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * src/page.ts imports the Vite manifest that `bun run build:worker` writes.
 * Tests do not need the real bundle, so stub it when there has been no build.
 */
export default function setup(): void {
  const path = fileURLToPath(
    new URL("../src/manifest.json", import.meta.url).href,
  );
  if (existsSync(path)) return;
  writeFileSync(
    path,
    JSON.stringify({
      "index.html": { file: "assets/test.js", css: ["assets/test.css"] },
    }),
  );
}
