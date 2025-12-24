import type * as os from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { CommentFile } from "../types";
import {
  computeHash,
  createComment,
  getCommentPath,
  getLineHint,
  getLineNumber,
  parseCommentFile,
  serializeComments,
  truncateSelection,
} from "./comment-storage";

// Mock os.homedir for consistent test results
vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof os>("node:os");
  return {
    ...actual,
    homedir: vi.fn(() => "/home/testuser"),
  };
});

describe("getCommentPath", () => {
  it("handles absolute path", () => {
    const result = getCommentPath("/home/user/doc.md");
    expect(result).toBe(
      "/home/testuser/.readit/comments/home/user/doc.comments.md",
    );
  });

  it("handles deep nesting", () => {
    const result = getCommentPath("/a/b/c/d/e/f.md");
    expect(result).toBe(
      "/home/testuser/.readit/comments/a/b/c/d/e/f.comments.md",
    );
  });

  it("handles HTML files", () => {
    const result = getCommentPath("/docs/api.html");
    expect(result).toBe("/home/testuser/.readit/comments/docs/api.comments.md");
  });

  it("handles root path", () => {
    const result = getCommentPath("/file.md");
    expect(result).toBe("/home/testuser/.readit/comments/file.comments.md");
  });

  it("handles files with spaces in path", () => {
    const result = getCommentPath("/path/to/my file.md");
    expect(result).toBe(
      "/home/testuser/.readit/comments/path/to/my file.comments.md",
    );
  });
});

describe("computeHash", () => {
  it("returns 16 character hash", () => {
    const hash = computeHash("test content");
    expect(hash).toHaveLength(16);
  });

  it("returns consistent hash for same content", () => {
    const hash1 = computeHash("hello world");
    const hash2 = computeHash("hello world");
    expect(hash1).toBe(hash2);
  });

  it("returns different hash for different content", () => {
    const hash1 = computeHash("hello");
    const hash2 = computeHash("world");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", () => {
    const hash = computeHash("");
    expect(hash).toHaveLength(16);
  });

  it("handles unicode content", () => {
    const hash = computeHash("こんにちは");
    expect(hash).toHaveLength(16);
  });
});

describe("getLineNumber", () => {
  it("returns 1 for first line", () => {
    expect(getLineNumber("abc\ndef", 0)).toBe(1);
    expect(getLineNumber("abc\ndef", 2)).toBe(1);
  });

  it("returns 2 for second line", () => {
    expect(getLineNumber("abc\ndef", 4)).toBe(2);
  });

  it("returns 1 for end of first line", () => {
    expect(getLineNumber("abc\ndef", 3)).toBe(1);
  });

  it("returns 1 for empty content", () => {
    expect(getLineNumber("", 0)).toBe(1);
  });

  it("handles many lines", () => {
    // "line\n" repeated 100 times, each segment is 5 chars
    const content = Array(100).fill("line").join("\n");
    expect(getLineNumber(content, 0)).toBe(1); // Start of line 1
    expect(getLineNumber(content, 250)).toBe(51); // After 50 newlines = line 51
    expect(getLineNumber(content, 495)).toBe(100); // Start of line 100
  });

  it("handles offset beyond content length", () => {
    const line = getLineNumber("abc\ndef", 1000);
    expect(line).toBe(2);
  });
});

describe("getLineHint", () => {
  it("returns single line hint for same line", () => {
    const content = "line one\nline two\nline three";
    expect(getLineHint(content, 0, 4)).toBe("L1");
  });

  it("returns range hint for multiple lines", () => {
    const content = "line one\nline two\nline three";
    expect(getLineHint(content, 0, 20)).toBe("L1-3");
  });
});

describe("parseCommentFile", () => {
  it("returns empty result for empty file", () => {
    const result = parseCommentFile("");
    expect(result.comments).toEqual([]);
    expect(result.source).toBe("");
    expect(result.hash).toBe("");
  });

  it("parses front matter only", () => {
    const content = `---
source: /path/to/doc.md
hash: abc123def456
version: 1
---`;
    const result = parseCommentFile(content);
    expect(result.source).toBe("/path/to/doc.md");
    expect(result.hash).toBe("abc123def456");
    expect(result.version).toBe(1);
    expect(result.comments).toEqual([]);
  });

  it("parses single comment", () => {
    const content = `---
source: /path/to/doc.md
hash: abc123def456
version: 1
---

<!-- c:12345678|L42|2024-12-24T10:30:00Z -->
> selected text here

This is my comment.

---
`;
    const result = parseCommentFile(content);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].id).toBe("12345678");
    expect(result.comments[0].selectedText).toBe("selected text here");
    expect(result.comments[0].comment).toBe("This is my comment.");
    expect(result.comments[0].lineHint).toBe("L42");
    expect(result.comments[0].createdAt).toBe("2024-12-24T10:30:00Z");
  });

  it("parses multiple comments", () => {
    const content = `---
source: /path/to/doc.md
hash: abc123def456
version: 1
---

<!-- c:11111111|L10|2024-12-24T10:00:00Z -->
> first selection

First comment.

---

<!-- c:22222222|L20|2024-12-24T11:00:00Z -->
> second selection

Second comment.

---

<!-- c:33333333|L30|2024-12-24T12:00:00Z -->
> third selection

Third comment.

---
`;
    const result = parseCommentFile(content);
    expect(result.comments).toHaveLength(3);
    expect(result.comments[0].id).toBe("11111111");
    expect(result.comments[1].id).toBe("22222222");
    expect(result.comments[2].id).toBe("33333333");
  });

  it("parses multiline blockquote", () => {
    const content = `---
source: /test.md
hash: abc
version: 1
---

<!-- c:12345678|L42|2024-12-24T10:30:00Z -->
> line one
> line two
> line three

Comment here.

---
`;
    const result = parseCommentFile(content);
    expect(result.comments[0].selectedText).toBe(
      "line one\nline two\nline three",
    );
  });

  it("skips blocks without metadata", () => {
    const content = `---
source: /test.md
hash: abc
version: 1
---

> Just a blockquote without metadata

Some text.

---

<!-- c:12345678|L42|2024-12-24T10:30:00Z -->
> valid selection

Valid comment.

---
`;
    const result = parseCommentFile(content);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].id).toBe("12345678");
  });

  it("handles malformed metadata gracefully", () => {
    const content = `---
source: /test.md
hash: abc
version: 1
---

<!-- c:bad-format -->
> some text

Comment.

---
`;
    const result = parseCommentFile(content);
    expect(result.comments).toHaveLength(0);
  });

  it("parses anchorPrefix when present", () => {
    const content = `---
source: /test.md
hash: abc
version: 1
---

<!-- c:12345678|L42|2024-12-24T10:30:00Z -->
<!-- anchor:first 200 chars of original text -->
> truncated display text...

Comment here.

---
`;
    const result = parseCommentFile(content);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].anchorPrefix).toBe(
      "first 200 chars of original text",
    );
  });

  it("parses comment without anchorPrefix", () => {
    const content = `---
source: /test.md
hash: abc
version: 1
---

<!-- c:12345678|L42|2024-12-24T10:30:00Z -->
> short selected text

Comment here.

---
`;
    const result = parseCommentFile(content);
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].anchorPrefix).toBeUndefined();
  });
});

describe("serializeComments", () => {
  it("serializes empty array to front matter only", () => {
    const file: CommentFile = {
      source: "/path/to/doc.md",
      hash: "abc123def456",
      version: 1,
      comments: [],
    };
    const result = serializeComments(file);
    expect(result).toContain("source: /path/to/doc.md");
    expect(result).toContain("hash: abc123def456");
    expect(result).toContain("version: 1");
    expect(result).not.toContain("<!-- c:");
  });

  it("serializes single comment", () => {
    const file: CommentFile = {
      source: "/test.md",
      hash: "abc",
      version: 1,
      comments: [
        {
          id: "12345678",
          selectedText: "selected text",
          comment: "My comment",
          createdAt: "2024-12-24T10:30:00Z",
          lineHint: "L42",
          startOffset: 100,
          endOffset: 113,
        },
      ],
    };
    const result = serializeComments(file);
    expect(result).toContain("<!-- c:12345678|L42|2024-12-24T10:30:00Z -->");
    expect(result).toContain("> selected text");
    expect(result).toContain("My comment");
  });

  it("serializes multiline selected text", () => {
    const file: CommentFile = {
      source: "/test.md",
      hash: "abc",
      version: 1,
      comments: [
        {
          id: "12345678",
          selectedText: "line one\nline two",
          comment: "Comment",
          createdAt: "2024-12-24T10:30:00Z",
          lineHint: "L42-43",
          startOffset: 100,
          endOffset: 120,
        },
      ],
    };
    const result = serializeComments(file);
    expect(result).toContain("> line one");
    expect(result).toContain("> line two");
  });

  it("serializes anchorPrefix when present", () => {
    const file: CommentFile = {
      source: "/test.md",
      hash: "abc",
      version: 1,
      comments: [
        {
          id: "12345678",
          selectedText: "truncated text...",
          comment: "Comment",
          createdAt: "2024-12-24T10:30:00Z",
          lineHint: "L42",
          startOffset: 100,
          endOffset: 500,
          anchorPrefix: "first 200 chars of original text",
        },
      ],
    };
    const result = serializeComments(file);
    expect(result).toContain(
      "<!-- anchor:first 200 chars of original text -->",
    );
  });

  it("does not serialize anchor when anchorPrefix is undefined", () => {
    const file: CommentFile = {
      source: "/test.md",
      hash: "abc",
      version: 1,
      comments: [
        {
          id: "12345678",
          selectedText: "short text",
          comment: "Comment",
          createdAt: "2024-12-24T10:30:00Z",
          lineHint: "L42",
          startOffset: 100,
          endOffset: 110,
        },
      ],
    };
    const result = serializeComments(file);
    expect(result).not.toContain("<!-- anchor:");
  });

  it("roundtrip: parse(serialize(file)) equals original", () => {
    const original: CommentFile = {
      source: "/test.md",
      hash: "abc123def456",
      version: 1,
      comments: [
        {
          id: "12345678",
          selectedText: "selected text",
          comment: "My comment",
          createdAt: "2024-12-24T10:30:00Z",
          lineHint: "L42",
          startOffset: 100,
          endOffset: 113,
        },
        {
          id: "87654321",
          selectedText: "another\nmultiline\nselection",
          comment: "Another comment with\n\nmultiple paragraphs.",
          createdAt: "2024-12-24T11:00:00Z",
          lineHint: "L50-52",
          startOffset: 200,
          endOffset: 230,
        },
      ],
    };

    const serialized = serializeComments(original);
    const parsed = parseCommentFile(serialized);

    expect(parsed.source).toBe(original.source);
    expect(parsed.hash).toBe(original.hash);
    expect(parsed.version).toBe(original.version);
    expect(parsed.comments).toHaveLength(original.comments.length);

    for (let i = 0; i < original.comments.length; i++) {
      expect(parsed.comments[i].id).toBe(original.comments[i].id);
      expect(parsed.comments[i].selectedText).toBe(
        original.comments[i].selectedText,
      );
      expect(parsed.comments[i].lineHint).toBe(original.comments[i].lineHint);
      expect(parsed.comments[i].createdAt).toBe(original.comments[i].createdAt);
    }
  });

  it("roundtrip: preserves anchorPrefix through serialize/parse", () => {
    const original: CommentFile = {
      source: "/test.md",
      hash: "abc123",
      version: 1,
      comments: [
        {
          id: "12345678",
          selectedText: "truncated text\n...\nend of text",
          comment: "Comment on long selection",
          createdAt: "2024-12-24T10:30:00Z",
          lineHint: "L42",
          startOffset: 100,
          endOffset: 2000,
          anchorPrefix: "first 200 chars of the original long text",
        },
      ],
    };

    const serialized = serializeComments(original);
    const parsed = parseCommentFile(serialized);

    expect(parsed.comments[0].anchorPrefix).toBe(
      original.comments[0].anchorPrefix,
    );
  });
});

describe("createComment", () => {
  it("creates comment with generated ID", () => {
    const comment = createComment(
      "text",
      "comment",
      10,
      20,
      "some content\nmore lines",
    );
    expect(comment.id).toHaveLength(8);
    expect(comment.selectedText).toBe("text");
    expect(comment.comment).toBe("comment");
    expect(comment.startOffset).toBe(10);
    expect(comment.endOffset).toBe(20);
  });

  it("generates line hint based on offsets", () => {
    const content = "line one\nline two\nline three";
    const comment = createComment("two", "comment", 14, 17, content);
    expect(comment.lineHint).toBe("L2");
  });

  it("generates ISO timestamp", () => {
    const comment = createComment("text", "comment", 0, 4, "text");
    expect(comment.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("truncates very long selections", () => {
    const longText = "a".repeat(2000);
    const comment = createComment(longText, "comment", 0, 2000, longText);
    expect(comment.selectedText.length).toBeLessThan(1010);
    expect(comment.selectedText).toContain("...");
  });

  it("does not set anchorPrefix for short selections", () => {
    const comment = createComment("short text", "comment", 0, 10, "short text");
    expect(comment.anchorPrefix).toBeUndefined();
  });

  it("sets anchorPrefix for truncated selections", () => {
    const longText = "x".repeat(2000);
    const comment = createComment(longText, "comment", 0, 2000, longText);
    expect(comment.anchorPrefix).toBeDefined();
    expect(comment.anchorPrefix).toHaveLength(200);
    expect(comment.anchorPrefix).toBe("x".repeat(200));
  });

  it("anchorPrefix preserves first 200 chars of original text", () => {
    const prefix = "PREFIX_";
    const middle = "m".repeat(1500);
    const suffix = "_SUFFIX";
    const longText = prefix + middle + suffix;
    const comment = createComment(
      longText,
      "comment",
      0,
      longText.length,
      longText,
    );
    expect(comment.anchorPrefix?.startsWith("PREFIX_")).toBe(true);
    expect(comment.anchorPrefix).toHaveLength(200);
  });
});

describe("truncateSelection", () => {
  it("returns short text unchanged", () => {
    expect(truncateSelection("short text")).toBe("short text");
  });

  it("returns text at exactly max length unchanged", () => {
    const exactLength = "a".repeat(1000);
    expect(truncateSelection(exactLength)).toBe(exactLength);
  });

  it("truncates text over 1000 chars", () => {
    const longText = "a".repeat(2000);
    const result = truncateSelection(longText);
    expect(result.length).toBeLessThan(1010);
    expect(result).toContain("\n...\n");
  });

  it("preserves start and end of text", () => {
    const start = "START".repeat(100);
    const end = "END".repeat(100);
    const longText = start + "middle".repeat(100) + end;
    const result = truncateSelection(longText);
    expect(result.startsWith("START")).toBe(true);
    expect(result.endsWith("END")).toBe(true);
  });
});

describe("parseCommentFile version check", () => {
  it("accepts current version", () => {
    const content = `---
source: /test.md
hash: abc
version: 1
---`;
    expect(() => parseCommentFile(content)).not.toThrow();
  });

  it("throws on unsupported future version", () => {
    const content = `---
source: /test.md
hash: abc
version: 99
---`;
    expect(() => parseCommentFile(content)).toThrow(/requires readit v99/);
  });

  it("includes current version in error message", () => {
    const content = `---
source: /test.md
hash: abc
version: 99
---`;
    expect(() => parseCommentFile(content)).toThrow(/supports format v1/);
  });
});
