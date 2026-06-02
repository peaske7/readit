import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { filePathFromUri, isMarkdownUri } from "./zed-lsp";

describe("Zed LSP URI helpers", () => {
  it("decodes file URIs", () => {
    const uri = pathToFileURL("/tmp/readit docs/example.md").href;

    expect(filePathFromUri(uri)).toBe("/tmp/readit docs/example.md");
  });

  it("accepts markdown file URIs only", () => {
    expect(isMarkdownUri(pathToFileURL("/tmp/example.md").href)).toBe(true);
    expect(isMarkdownUri(pathToFileURL("/tmp/example.markdown").href)).toBe(
      true,
    );
    expect(isMarkdownUri(pathToFileURL("/tmp/example.txt").href)).toBe(false);
    expect(isMarkdownUri("untitled:Untitled-1")).toBe(false);
  });
});
