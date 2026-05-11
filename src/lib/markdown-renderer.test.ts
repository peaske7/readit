import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderMarkdown, toggleTaskInSource } from "./markdown-renderer";

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

  it("renders task list checkboxes as styleable spans", async () => {
    const { html } = await renderMarkdown("- [ ] todo\n- [x] done\n- normal\n");

    expect(html).toContain('<span class="task-checkbox" data-checked="false"');
    expect(html).toContain('<span class="task-checkbox" data-checked="true"');
    expect(html).not.toContain("[ ]");
    expect(html).not.toContain("[x]");
  });

  it("emits sequential data-task-index attributes", async () => {
    const { html } = await renderMarkdown("- [ ] a\n- [x] b\n- [ ] c\n");
    expect(html).toContain('data-task-index="0"');
    expect(html).toContain('data-task-index="1"');
    expect(html).toContain('data-task-index="2"');
  });

  it("wraps frontmatter in a collapsed details block", async () => {
    const src = `---\nid: 12\ntags:\n  - daily-notes\n---\n\n# Title\n\nBody.\n`;
    const { html, headings } = await renderMarkdown(src);

    expect(html.startsWith('<details class="frontmatter">')).toBe(true);
    expect(html).toContain("<summary>Properties</summary>");
    expect(html).not.toMatch(/^<hr/);
    expect(headings).toEqual([{ id: "title", text: "Title", level: 1 }]);
  });

  it("does not treat an unclosed leading --- as frontmatter", async () => {
    const { html } = await renderMarkdown("---\n\n# Title\n");
    expect(html).not.toContain('class="frontmatter"');
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

describe("toggleTaskInSource", () => {
  it("toggles the Nth task between [ ] and [x]", () => {
    const src = "- [ ] one\n- [x] two\n- [ ] three\n";
    expect(toggleTaskInSource(src, 0, true)).toBe(
      "- [x] one\n- [x] two\n- [ ] three\n",
    );
    expect(toggleTaskInSource(src, 1, false)).toBe(
      "- [ ] one\n- [ ] two\n- [ ] three\n",
    );
  });

  it("returns null for out-of-range index", () => {
    expect(toggleTaskInSource("- [ ] one\n", 5, true)).toBe(null);
  });

  it("skips frontmatter when counting", () => {
    const src = "---\ntags:\n  - foo\n---\n\n- [ ] real\n";
    expect(toggleTaskInSource(src, 0, true)).toBe(
      "---\ntags:\n  - foo\n---\n\n- [x] real\n",
    );
  });

  it("skips fenced code blocks when counting", () => {
    const src =
      "- [ ] real one\n\n```\n- [ ] code sample\n```\n\n- [ ] real two\n";
    const out = toggleTaskInSource(src, 1, true);
    expect(out).toContain("- [x] real two");
    expect(out).toContain("- [ ] code sample");
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
