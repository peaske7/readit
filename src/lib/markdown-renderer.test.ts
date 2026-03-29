import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown-renderer";

const SAMPLE_MARKDOWN = `# Hello World

This is a paragraph with **bold** and *italic* text.

## Code Example

\`\`\`typescript
function hello() {
  return "world";
}
\`\`\`

Some text after the code block.

- Item 1
- Item 2
- Item 3

### Table

| Name | Value |
|------|-------|
| foo  | bar   |
| baz  | qux   |

> A blockquote with some text.

Final paragraph.
`;

const SAMPLE_WITH_MERMAID = `# Diagrams

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

After mermaid.
`;

describe("renderMarkdown", () => {
  it("renders basic markdown to HTML", async () => {
    const { html } = await renderMarkdown(SAMPLE_MARKDOWN);

    expect(html).toContain("<h1");
    expect(html).toContain("Hello World");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<h2");
    expect(html).toContain("Code Example");
    expect(html).toContain("<h3");
    expect(html).toContain("Table");
  });

  it("extracts headings with correct IDs", async () => {
    const { headings } = await renderMarkdown(SAMPLE_MARKDOWN);

    expect(headings).toEqual([
      { id: "hello-world", text: "Hello World", level: 1 },
      { id: "code-example", text: "Code Example", level: 2 },
      { id: "table", text: "Table", level: 3 },
    ]);
  });

  it("injects heading IDs into HTML", async () => {
    const { html } = await renderMarkdown(SAMPLE_MARKDOWN);

    expect(html).toContain('id="hello-world"');
    expect(html).toContain('id="code-example"');
    expect(html).toContain('id="table"');
  });

  it("syntax-highlights code blocks with shiki", async () => {
    const { html } = await renderMarkdown(SAMPLE_MARKDOWN);

    expect(html).toContain("shiki");
    expect(html).toContain("hello");
    expect(html).toContain("world");
  });

  it("leaves mermaid blocks for client-side hydration", async () => {
    const { html } = await renderMarkdown(SAMPLE_WITH_MERMAID);

    expect(html).toContain('class="language-mermaid"');
    expect(html).toContain("graph TD");
    expect(html).not.toMatch(/class="shiki[^"]*"[^>]*>.*graph TD/s);
  });

  it("renders GFM tables", async () => {
    const { html } = await renderMarkdown(SAMPLE_MARKDOWN);

    expect(html).toContain("<table>");
    expect(html).toContain("<th>");
    expect(html).toContain("foo");
  });

  it("renders lists", async () => {
    const { html } = await renderMarkdown(SAMPLE_MARKDOWN);

    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain("Item 1");
  });

  it("renders blockquotes", async () => {
    const { html } = await renderMarkdown(SAMPLE_MARKDOWN);

    expect(html).toContain("<blockquote>");
    expect(html).toContain("A blockquote with some text.");
  });

  it("handles duplicate headings", async () => {
    const md = `## Section\n\n## Section\n\n## Section\n`;
    const { headings } = await renderMarkdown(md);

    expect(headings).toEqual([
      { id: "section", text: "Section", level: 2 },
      { id: "section-1", text: "Section", level: 2 },
      { id: "section-2", text: "Section", level: 2 },
    ]);
  });
});

describe("text offset conformance", () => {
  it("rendered HTML has proper block structure for text offset extraction", async () => {
    const { html } = await renderMarkdown(SAMPLE_MARKDOWN);

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const paragraphs = doc.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThan(0);

    const h1 = doc.querySelector("h1");
    expect(h1?.id).toBe("hello-world");
    expect(h1?.textContent).toBe("Hello World");

    const pres = doc.querySelectorAll("pre");
    expect(pres.length).toBeGreaterThan(0);

    const lis = doc.querySelectorAll("li");
    expect(lis.length).toBe(3);

    const trs = doc.querySelectorAll("tr");
    expect(trs.length).toBeGreaterThan(0);

    const blockquote = doc.querySelector("blockquote");
    expect(blockquote).not.toBeNull();
  });
});
