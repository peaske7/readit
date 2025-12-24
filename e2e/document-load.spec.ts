import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { spawnCli } from "./utils/cli";

const FIXTURES_DIR = resolve(import.meta.dirname, "fixtures");

test.describe("Document Loading", () => {
  test("loads markdown document and displays content", async ({ page }) => {
    const { url, cleanup } = await spawnCli(
      resolve(FIXTURES_DIR, "sample.md"),
      { port: 4570 },
    );

    try {
      await page.goto(url);

      // Wait for document to load - use article scope to avoid header h1
      const article = page.locator("article");
      await expect(article.locator("h1")).toContainText("Test Document");

      // Verify paragraph content is rendered
      await expect(article).toContainText(
        "This is a paragraph for testing text selection",
      );

      // Verify second section is visible
      await expect(article.locator("h2")).toContainText("Second Section");
    } finally {
      await cleanup();
    }
  });

  test("loads HTML document in iframe", async ({ page }) => {
    const { url, cleanup } = await spawnCli(
      resolve(FIXTURES_DIR, "sample.html"),
      { port: 4571 },
    );

    try {
      await page.goto(url);

      // Wait for iframe to exist
      const iframe = page.frameLocator("iframe");

      // Verify content inside iframe
      await expect(iframe.locator("h1")).toContainText("Test Document");
      await expect(iframe.locator("p").first()).toContainText(
        "This is a paragraph for testing text selection",
      );
    } finally {
      await cleanup();
    }
  });
});
