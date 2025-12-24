import { describe, expect, it } from "vitest";
import { extractContext, formatForLLM, stripHtmlTags } from "./context";

describe("stripHtmlTags", () => {
  it("removes simple HTML tags", () => {
    expect(stripHtmlTags("<p>Hello</p>")).toBe("Hello");
    expect(stripHtmlTags("<div><span>Nested</span></div>")).toBe("Nested");
  });

  it("removes script and style content entirely", () => {
    expect(stripHtmlTags('<script>alert("xss")</script>text')).toBe("text");
    expect(stripHtmlTags("<style>.foo { color: red }</style>text")).toBe(
      "text",
    );
  });

  it("decodes common named entities", () => {
    expect(stripHtmlTags("&lt;tag&gt;")).toBe("<tag>");
    expect(stripHtmlTags("&amp;&nbsp;&quot;&#39;")).toBe("& \"'");
  });

  it("decodes numeric entities (decimal)", () => {
    expect(stripHtmlTags("&#65;&#66;&#67;")).toBe("ABC");
  });

  it("decodes numeric entities (hex)", () => {
    expect(stripHtmlTags("&#x41;&#x42;&#x43;")).toBe("ABC");
    expect(stripHtmlTags("&#X41;&#X42;&#X43;")).toBe("ABC"); // case-insensitive
  });

  it("handles mixed content", () => {
    const html = "<p>Hello &amp; <strong>World</strong>!</p>";
    expect(stripHtmlTags(html)).toBe("Hello & World!");
  });

  it("preserves plain text", () => {
    expect(stripHtmlTags("plain text")).toBe("plain text");
  });
});

describe("extractContext", () => {
  it("extracts single-line selection with markers", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    // "line2" starts at offset 6, ends at 11
    const result = extractContext(content, 6, 11);

    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(2);
    // Should have >>> and <<< markers around "line2"
    expect(result.lines.some((l) => l.includes(">>> line2 <<<"))).toBe(true);
  });

  it("includes context lines before and after", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    // Select "line3" at offset 12
    const result = extractContext(content, 12, 17, 2);

    expect(result.startLine).toBe(3);
    expect(result.endLine).toBe(3);
    // Should include 2 lines before (line1, line2) and 2 after (line4, line5)
    expect(result.lines.length).toBe(5);
  });

  it("handles multi-line selection", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    // Select from "line2" to "line3" (offset 6 to 17)
    const result = extractContext(content, 6, 17);

    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(3);
    // Start line should have >>> marker
    expect(result.lines.some((l) => l.includes(">>>"))).toBe(true);
    // End line should have <<< marker
    expect(result.lines.some((l) => l.includes("<<<"))).toBe(true);
  });

  it("handles selection at start of document", () => {
    const content = "line1\nline2\nline3";
    // Select "line1" at start
    const result = extractContext(content, 0, 5);

    expect(result.startLine).toBe(1);
    expect(result.endLine).toBe(1);
    expect(result.lines[0]).toContain(">>> line1 <<<");
  });

  it("handles selection at end of document", () => {
    const content = "line1\nline2\nline3";
    // Select "line3" (offset 12 to 17)
    const result = extractContext(content, 12, 17);

    expect(result.startLine).toBe(3);
    expect(result.endLine).toBe(3);
    expect(result.lines.some((l) => l.includes(">>> line3 <<<"))).toBe(true);
  });

  it("truncates very long lines", () => {
    const longLine = "a".repeat(250);
    const content = `short\n${longLine}\nshort`;
    // Select part of the long line
    const result = extractContext(content, 6, 256);

    // Long line should be truncated with ...
    const longLineOutput = result.lines.find((l) => l.length > 100);
    expect(longLineOutput?.endsWith("...")).toBe(true);
  });

  it("handles HTML content by stripping tags", () => {
    const html = "<p>paragraph</p>\n<div>div content</div>";
    // After stripping: "paragraph\ndiv content"
    // Select "paragraph" at offset 0-9
    const result = extractContext(html, 0, 9);

    expect(result.lines.some((l) => l.includes(">>> paragraph <<<"))).toBe(
      true,
    );
  });

  it("normalizes CRLF to LF", () => {
    const content = "line1\r\nline2\r\nline3";
    // After normalization: "line1\nline2\nline3"
    // Select "line2" at offset 6
    const result = extractContext(content, 6, 11);

    expect(result.startLine).toBe(2);
    expect(result.lines.some((l) => l.includes(">>> line2 <<<"))).toBe(true);
  });

  it("limits context lines to document bounds", () => {
    const content = "only\ntwo\nlines";
    // Select middle line with 5 context lines requested
    const result = extractContext(content, 5, 8, 5);

    // Should not go beyond document bounds
    expect(result.lines.length).toBeLessThanOrEqual(3);
  });

  it("truncates very long selections with ellipsis", () => {
    // Create content with more than MAX_SELECTION_LINES (10) lines
    const lines = Array.from({ length: 15 }, (_, i) => `line${i + 1}`);
    const content = lines.join("\n");
    // Select all content
    const result = extractContext(content, 0, content.length, 0);

    // Should include ... for truncated middle
    expect(result.lines.some((l) => l === "...")).toBe(true);
  });
});

describe("formatForLLM", () => {
  it("formats context with header and line range", () => {
    const context = {
      lines: ["before", ">>> selected <<<", "after"],
      startLine: 5,
      endLine: 5,
    };

    const result = formatForLLM({ context, fileName: "test.md" });

    expect(result).toContain("# From: test.md");
    expect(result).toContain("Lines 5-5:");
    expect(result).toContain("---");
    expect(result).toContain(">>> selected <<<");
  });

  it("includes optional comment", () => {
    const context = {
      lines: ["text"],
      startLine: 1,
      endLine: 1,
    };

    const result = formatForLLM({
      context,
      fileName: "test.md",
      comment: "This needs review",
    });

    expect(result).toContain("Comment: This needs review");
  });

  it("omits comment section when not provided", () => {
    const context = {
      lines: ["text"],
      startLine: 1,
      endLine: 1,
    };

    const result = formatForLLM({ context, fileName: "test.md" });

    expect(result).not.toContain("Comment:");
  });

  it("formats multi-line range correctly", () => {
    const context = {
      lines: [">>> start", "middle", "end <<<"],
      startLine: 10,
      endLine: 12,
    };

    const result = formatForLLM({ context, fileName: "doc.html" });

    expect(result).toContain("Lines 10-12:");
  });
});
