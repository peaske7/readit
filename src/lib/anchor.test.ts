import { describe, expect, it } from "vitest";
import {
  findAnchor,
  findAnchorFuzzy,
  findAnchorNormalized,
  findAnchorWithFallback,
  findClosestOccurrence,
  getLineOffset,
  levenshteinDistance,
  normalizeWhitespace,
  parseLineHint,
} from "./anchor";

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("returns length for one empty string", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "world")).toBe(5);
  });

  it("handles single character difference", () => {
    expect(levenshteinDistance("hello", "hallo")).toBe(1);
    expect(levenshteinDistance("cat", "hat")).toBe(1);
  });

  it("handles insertions", () => {
    expect(levenshteinDistance("hello", "helloo")).toBe(1);
    expect(levenshteinDistance("cat", "cats")).toBe(1);
  });

  it("handles deletions", () => {
    expect(levenshteinDistance("hello", "hell")).toBe(1);
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });

  it("handles multiple differences", () => {
    expect(levenshteinDistance("hello", "hallo")).toBe(1);
    expect(levenshteinDistance("hello", "hxllo")).toBe(1);
    expect(levenshteinDistance("hello world", "hallo worle")).toBe(2);
  });

  it("handles completely different strings", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(3);
    expect(levenshteinDistance("hello", "world")).toBe(4);
  });

  it("is symmetric", () => {
    expect(levenshteinDistance("hello", "hallo")).toBe(
      levenshteinDistance("hallo", "hello"),
    );
    expect(levenshteinDistance("abc", "xyz")).toBe(
      levenshteinDistance("xyz", "abc"),
    );
  });

  it("handles unicode", () => {
    expect(levenshteinDistance("こんにちは", "こんにちは")).toBe(0);
    expect(levenshteinDistance("こんにちは", "こんばんは")).toBe(2);
  });

  it("returns Infinity when exceeding maxDistance threshold", () => {
    // Length difference alone exceeds threshold
    expect(levenshteinDistance("hello", "hi", 1)).toBe(
      Number.POSITIVE_INFINITY,
    );

    // Content difference exceeds threshold during computation
    expect(levenshteinDistance("hello", "world", 2)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("returns actual distance when within maxDistance threshold", () => {
    expect(levenshteinDistance("hello", "hallo", 2)).toBe(1);
    expect(levenshteinDistance("cat", "cats", 1)).toBe(1);
  });
});

describe("normalizeWhitespace", () => {
  it("collapses multiple spaces", () => {
    expect(normalizeWhitespace("hello   world")).toBe("hello world");
  });

  it("collapses newlines and tabs", () => {
    expect(normalizeWhitespace("hello\n\nworld")).toBe("hello world");
    expect(normalizeWhitespace("hello\t\tworld")).toBe("hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  hello world  ")).toBe("hello world");
  });

  it("handles mixed whitespace", () => {
    expect(normalizeWhitespace("hello  \n\t  world")).toBe("hello world");
  });

  it("returns empty for whitespace-only input", () => {
    expect(normalizeWhitespace("   \n\t  ")).toBe("");
  });
});

describe("getLineOffset", () => {
  it("returns 0 for line 1", () => {
    expect(getLineOffset("abc\ndef\nghi", 1)).toBe(0);
  });

  it("returns correct offset for line 2", () => {
    expect(getLineOffset("abc\ndef\nghi", 2)).toBe(4);
  });

  it("returns correct offset for line 3", () => {
    expect(getLineOffset("abc\ndef\nghi", 3)).toBe(8);
  });

  it("returns content length for line beyond file", () => {
    const content = "abc\ndef";
    expect(getLineOffset(content, 10)).toBe(content.length);
  });

  it("handles empty content", () => {
    expect(getLineOffset("", 1)).toBe(0);
    expect(getLineOffset("", 5)).toBe(0);
  });
});

describe("parseLineHint", () => {
  it("parses single line hint", () => {
    expect(parseLineHint("L42")).toEqual({ start: 42, end: 42 });
    expect(parseLineHint("L1")).toEqual({ start: 1, end: 1 });
  });

  it("parses line range hint", () => {
    expect(parseLineHint("L42-45")).toEqual({ start: 42, end: 45 });
    expect(parseLineHint("L10-20")).toEqual({ start: 10, end: 20 });
  });

  it("returns default for invalid hint", () => {
    expect(parseLineHint("")).toEqual({ start: 1, end: 1 });
    expect(parseLineHint("invalid")).toEqual({ start: 1, end: 1 });
    expect(parseLineHint("42")).toEqual({ start: 1, end: 1 });
  });
});

describe("findAnchor", () => {
  const multilineContent = `line one
line two
line three
line four
line five
the target text here
line seven
line eight`;

  it("finds exact match at hinted line", () => {
    const result = findAnchor(multilineContent, "target text", "L6");
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("exact");
    expect(result?.line).toBe(6);
  });

  it("finds exact match when hint is wrong", () => {
    const result = findAnchor(multilineContent, "target text", "L1");
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("exact");
    expect(result?.line).toBe(6);
  });

  it("returns null when text not found", () => {
    const result = findAnchor(multilineContent, "nonexistent text", "L1");
    expect(result).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(findAnchor(multilineContent, "", "L1")).toBeNull();
  });

  it("returns null for empty source", () => {
    expect(findAnchor("", "text", "L1")).toBeNull();
  });

  it("handles partial matches (substring)", () => {
    const result = findAnchor(multilineContent, "target", "L6");
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("exact");
  });

  it("is case sensitive", () => {
    const result = findAnchor(multilineContent, "Target Text", "L6");
    expect(result).toBeNull();
  });

  it("handles unicode", () => {
    const content = "first line\nこんにちは\nthird line";
    const result = findAnchor(content, "にちは", "L2");
    expect(result).not.toBeNull();
    expect(result?.line).toBe(2);
  });

  it("returns correct offsets", () => {
    const content = "hello world";
    const result = findAnchor(content, "world", "L1");
    expect(result).not.toBeNull();
    expect(result?.start).toBe(6);
    expect(result?.end).toBe(11);
  });
});

describe("findAnchorNormalized", () => {
  it("finds text with collapsed whitespace", () => {
    // Original had "hello world" but source was reformatted
    const source = "hello\n  world";
    const result = findAnchorNormalized(source, "hello  world", "L1");
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("normalized");
  });

  it("handles newlines in original text", () => {
    const source = "hello world";
    const result = findAnchorNormalized(source, "hello\nworld", "L1");
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("normalized");
  });

  it("returns null when text has no collapsible whitespace", () => {
    // If original text has no extra whitespace, exact match would have worked
    const result = findAnchorNormalized("hello world", "hello world", "L1");
    expect(result).toBeNull();
  });

  it("returns null when normalized text not found", () => {
    const result = findAnchorNormalized("hello world", "goodbye  moon", "L1");
    expect(result).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(findAnchorNormalized("hello world", "", "L1")).toBeNull();
  });

  it("returns null for empty source", () => {
    expect(findAnchorNormalized("", "hello  world", "L1")).toBeNull();
  });

  it("uses line hint for faster search", () => {
    const source = `line one
line two hello  world here
line three`;
    const result = findAnchorNormalized(source, "hello\n\nworld", "L2");
    expect(result).not.toBeNull();
    expect(result?.line).toBe(2);
  });
});

describe("findAnchorFuzzy", () => {
  it("finds exact match with distance 0", () => {
    const result = findAnchorFuzzy("hello world", "hello world");
    expect(result).not.toBeNull();
    expect(result?.distance).toBe(0);
    expect(result?.confidence).toBe("fuzzy");
  });

  it("finds match with one character typo", () => {
    const result = findAnchorFuzzy("hello world", "hello worle");
    expect(result).not.toBeNull();
    expect(result?.distance).toBe(1);
  });

  it("finds match with two character difference", () => {
    const result = findAnchorFuzzy("hello world", "hallo worle");
    expect(result).not.toBeNull();
    expect(result?.distance).toBeLessThanOrEqual(2);
  });

  it("returns null when difference exceeds threshold", () => {
    const result = findAnchorFuzzy("hello world", "goodbye moon", {
      threshold: 3,
    });
    expect(result).toBeNull();
  });

  it("respects custom threshold", () => {
    const result = findAnchorFuzzy("hello world", "hxxxx xxxxx", {
      threshold: 10,
    });
    expect(result).not.toBeNull();
  });

  it("returns null for empty text", () => {
    expect(findAnchorFuzzy("hello world", "")).toBeNull();
  });

  it("returns null for empty source", () => {
    expect(findAnchorFuzzy("", "hello")).toBeNull();
  });

  it("uses line hint to narrow search", () => {
    const content = "abc\ndef\nghi\njkl\nmno\npqr";
    const result = findAnchorFuzzy(content, "ghx", {
      lineHint: "L3",
      threshold: 1,
    });
    expect(result).not.toBeNull();
    expect(result?.line).toBe(3);
  });
});

describe("findAnchorWithFallback", () => {
  it("returns exact match when available", () => {
    const result = findAnchorWithFallback("hello world", "hello", "L1");
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("exact");
  });

  it("falls back to normalized match when exact fails", () => {
    // Source was reformatted (newlines instead of spaces)
    const result = findAnchorWithFallback("hello\nworld", "hello  world", "L1");
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("normalized");
  });

  it("falls back to fuzzy match when exact and normalized fail", () => {
    const result = findAnchorWithFallback("hello world", "helloo world", "L1");
    expect(result).not.toBeNull();
    expect(result?.confidence).toBe("fuzzy");
  });

  it("returns null when all strategies fail", () => {
    const result = findAnchorWithFallback(
      "hello world",
      "completely different text",
      "L1",
    );
    expect(result).toBeNull();
  });
});

describe("findClosestOccurrence", () => {
  it("finds the occurrence closest to hint", () => {
    const content = "the cat sat on the mat and the rat";
    // "the" appears at positions 0, 15, and 27

    const result = findClosestOccurrence(content, "the", "L1");
    expect(result).not.toBeNull();
    // Should find the first "the" at position 0 since hint is L1
    expect(result?.start).toBe(0);
  });

  it("handles multiple occurrences correctly", () => {
    const content = `line one the
line two
line three the
line four
line five the`;

    // Test finding closest to line 3
    const result = findClosestOccurrence(content, "the", "L3");
    expect(result).not.toBeNull();
    expect(result?.line).toBe(3);
  });

  it("returns null when text not found", () => {
    const result = findClosestOccurrence("hello world", "xyz", "L1");
    expect(result).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(findClosestOccurrence("hello world", "", "L1")).toBeNull();
  });

  it("returns null for empty source", () => {
    expect(findClosestOccurrence("", "text", "L1")).toBeNull();
  });
});
