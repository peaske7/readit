import { describe, expect, it } from "vitest";
import { getDOMTextContent } from "./highlight/dom";
import { extractTextFromHtml } from "./html-text";
import { renderMarkdown } from "./markdown-renderer";

function browserExtract(html: string): string {
  const container = document.createElement("article");
  container.innerHTML = html;
  document.body.appendChild(container);
  const text = getDOMTextContent(container);
  document.body.removeChild(container);
  return text;
}

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

describe("extractTextFromHtml conformance with getDOMTextContent", () => {
  it("matches browser extraction for simple markdown", async () => {
    const md = `# Hello

This is a paragraph.

## Section

Another paragraph here.
`;
    const { html } = await renderMarkdown(md);
    const serverText = extractTextFromHtml(html);
    const browserText = browserExtract(html);
    expect(serverText).toBe(browserText);
  });

  it("matches browser extraction for lists", async () => {
    const md = `- Item 1
- Item 2
- Item 3
`;
    const { html } = await renderMarkdown(md);
    const serverText = extractTextFromHtml(html);
    const browserText = browserExtract(html);
    expect(serverText).toBe(browserText);
  });

  it("matches browser extraction for code blocks", async () => {
    const md = `# Code

\`\`\`typescript
function hello() {
  return "world";
}
\`\`\`

After code.
`;
    const { html } = await renderMarkdown(md);
    const serverText = extractTextFromHtml(html);
    const browserText = browserExtract(html);
    expect(serverText).toBe(browserText);
  });

  it("matches browser extraction for tables", async () => {
    const md = `| A | B |
|---|---|
| 1 | 2 |
| 3 | 4 |
`;
    const { html } = await renderMarkdown(md);
    const serverText = extractTextFromHtml(html);
    const browserText = browserExtract(html);
    expect(serverText).toBe(browserText);
  });

  it("matches browser extraction for complex document", async () => {
    const md = `# Performance Test Document

This section covers topic 1 in detail. It contains various formatting including **bold**, *italic*, and \`inline code\`.

## Section 2

- Item 1 in section 2
- Item 2 in section 2
- Item 3 in section 2

\`\`\`typescript
function section2() {
  const value = 2 * 42;
  return "result from section 2: " + value;
}
\`\`\`

The conclusion of section 2 summarizes the key findings.

| Column A | Column B | Column C |
|----------|----------|----------|
| Cell 1 | Cell 2 | Cell 3 |

> A blockquote with some text.

Final paragraph.
`;
    const { html } = await renderMarkdown(md);
    const serverText = extractTextFromHtml(html);
    const browserText = browserExtract(html);
    expect(serverText).toBe(browserText);
  });
});
