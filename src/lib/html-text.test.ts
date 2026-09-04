import { describe, expect, it } from "vitest";
import { extractTextFromHtml } from "./html-text";

// Cross-model conformance lives in `geometry/blocks.test.ts`, where all three
// text models walk the same fixture.
describe("extractTextFromHtml", () => {
  it("extracts plain text from paragraphs", () => {
    const html = "<p>Hello world</p><p>Second paragraph</p>";
    expect(extractTextFromHtml(html)).toBe("Hello world\nSecond paragraph");
  });

  it("handles headings", () => {
    const html = "<h1>Title</h1><p>Content</p>";
    expect(extractTextFromHtml(html)).toBe("Title\nContent");
  });

  it("handles nested block elements (no extra newline)", () => {
    const html = "<blockquote><p>Quoted text</p></blockquote><p>After</p>";
    const result = extractTextFromHtml(html);
    expect(result).toContain("Quoted text");
    expect(result).toContain("After");
  });

  it("handles lists", () => {
    const html = "<ul><li>Item 1</li><li>Item 2</li></ul>";
    expect(extractTextFromHtml(html)).toBe("Item 1\nItem 2");
  });

  it("handles inline elements within blocks", () => {
    const html = "<p>Text with <strong>bold</strong> and <em>italic</em></p>";
    expect(extractTextFromHtml(html)).toBe("Text with bold and italic");
  });

  it("decodes HTML entities", () => {
    const html = "<p>&lt;div&gt; &amp; &quot;quotes&quot;</p>";
    expect(extractTextFromHtml(html)).toBe('<div> & "quotes"');
  });

  it("handles code blocks", () => {
    const html =
      '<pre><code>function hello() {\n  return "world";\n}</code></pre>';
    expect(extractTextFromHtml(html)).toContain("function hello()");
  });
});
