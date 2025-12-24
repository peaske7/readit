import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHeadings } from "./useHeadings";

describe("useHeadings - markdown", () => {
  it("extracts basic headings", () => {
    const content = `# Heading 1
## Heading 2
### Heading 3`;

    const { result } = renderHook(() => useHeadings(content, "markdown"));

    expect(result.current).toEqual([
      { id: "heading-1", text: "Heading 1", level: 1 },
      { id: "heading-2", text: "Heading 2", level: 2 },
      { id: "heading-3", text: "Heading 3", level: 3 },
    ]);
  });

  it("handles duplicate headings", () => {
    const content = `## Section
## Section
## Section`;

    const { result } = renderHook(() => useHeadings(content, "markdown"));

    expect(result.current).toEqual([
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

    const { result } = renderHook(() => useHeadings(content, "markdown"));

    expect(result.current).toEqual([
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

    const { result } = renderHook(() => useHeadings(content, "markdown"));

    expect(result.current).toEqual([
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

    const { result } = renderHook(() => useHeadings(content, "markdown"));

    expect(result.current).toEqual([
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

    const { result } = renderHook(() => useHeadings(content, "markdown"));

    expect(result.current).toEqual([
      { id: "setup", text: "Setup", level: 1 },
      { id: "usage", text: "Usage", level: 2 },
    ]);
  });

  it("returns empty array for null content", () => {
    const { result } = renderHook(() => useHeadings(null, "markdown"));
    expect(result.current).toEqual([]);
  });

  it("returns empty array for null type", () => {
    const { result } = renderHook(() => useHeadings("# Heading", null));
    expect(result.current).toEqual([]);
  });
});

describe("useHeadings - html", () => {
  it("extracts basic headings", () => {
    const content = `<h1>Heading 1</h1>
<h2>Heading 2</h2>
<h3>Heading 3</h3>`;

    const { result } = renderHook(() => useHeadings(content, "html"));

    expect(result.current).toEqual([
      { id: "heading-1", text: "Heading 1", level: 1 },
      { id: "heading-2", text: "Heading 2", level: 2 },
      { id: "heading-3", text: "Heading 3", level: 3 },
    ]);
  });

  it("uses existing id attribute", () => {
    const content = `<h1 id="custom-id">Heading 1</h1>`;

    const { result } = renderHook(() => useHeadings(content, "html"));

    expect(result.current).toEqual([
      { id: "custom-id", text: "Heading 1", level: 1 },
    ]);
  });

  it("decodes HTML entities", () => {
    const content = `<h1>Hello &amp; World</h1>`;

    const { result } = renderHook(() => useHeadings(content, "html"));

    // Note: & is stripped, leaving "Hello  World" → "hello-world" (hyphens collapsed)
    expect(result.current).toEqual([
      { id: "hello-world", text: "Hello & World", level: 1 },
    ]);
  });
});
