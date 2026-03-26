import { describe, expect, it } from "vitest";
import { parseMarkdownHeadings } from "./headings";

describe("parseMarkdownHeadings", () => {
  it("extracts basic headings", () => {
    const content = `# Heading 1
## Heading 2
### Heading 3`;

    expect(parseMarkdownHeadings(content)).toEqual([
      { id: "heading-1", text: "Heading 1", level: 1 },
      { id: "heading-2", text: "Heading 2", level: 2 },
      { id: "heading-3", text: "Heading 3", level: 3 },
    ]);
  });

  it("handles duplicate headings", () => {
    const content = `## Section
## Section
## Section`;

    expect(parseMarkdownHeadings(content)).toEqual([
      { id: "section", text: "Section", level: 2 },
      { id: "section-1", text: "Section", level: 2 },
      { id: "section-2", text: "Section", level: 2 },
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    const content = `# Real Heading

\`\`\`bash
# This is a comment, not a heading
echo "hello"
\`\`\`

## Another Real Heading`;

    expect(parseMarkdownHeadings(content)).toEqual([
      { id: "real-heading", text: "Real Heading", level: 1 },
      { id: "another-real-heading", text: "Another Real Heading", level: 2 },
    ]);
  });

  it("ignores headings inside triple-tilde code blocks", () => {
    const content = `# Real Heading

~~~python
# Python comment
def foo():
    pass
~~~

## Another Real Heading`;

    expect(parseMarkdownHeadings(content)).toEqual([
      { id: "real-heading", text: "Real Heading", level: 1 },
      { id: "another-real-heading", text: "Another Real Heading", level: 2 },
    ]);
  });

  it("handles multiple code blocks", () => {
    const content = `# Introduction

\`\`\`bash
# Comment 1
\`\`\`

## Methods

\`\`\`python
# Comment 2
\`\`\`

## Results`;

    expect(parseMarkdownHeadings(content)).toEqual([
      { id: "introduction", text: "Introduction", level: 1 },
      { id: "methods", text: "Methods", level: 2 },
      { id: "results", text: "Results", level: 2 },
    ]);
  });

  it("handles code block with language specifier", () => {
    const content = `# Setup

\`\`\`bash
# Use a custom port
npx readit document.md --port 3000
\`\`\`

## Usage`;

    expect(parseMarkdownHeadings(content)).toEqual([
      { id: "setup", text: "Setup", level: 1 },
      { id: "usage", text: "Usage", level: 2 },
    ]);
  });

  it("returns empty array for empty content", () => {
    expect(parseMarkdownHeadings("")).toEqual([]);
  });
});
