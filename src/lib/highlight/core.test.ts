import { describe, expect, it } from "vitest";
import { findTextPosition } from "./core";

describe("findTextPosition", () => {
  it("finds single occurrence", () => {
    const result = findTextPosition("hello world", "world");
    expect(result).toEqual({ start: 6, end: 11 });
  });

  it("finds text at start", () => {
    const result = findTextPosition("hello world", "hello");
    expect(result).toEqual({ start: 0, end: 5 });
  });

  it("returns null for no match", () => {
    expect(findTextPosition("hello", "xyz")).toBeUndefined();
  });

  it("returns null for empty selectedText", () => {
    expect(findTextPosition("hello world", "")).toBeUndefined();
  });

  it("returns null for empty textContent", () => {
    expect(findTextPosition("", "hello")).toBeUndefined();
  });

  it("returns null for both empty", () => {
    expect(findTextPosition("", "")).toBeUndefined();
  });

  describe("multiple occurrences", () => {
    it("finds closest occurrence to hint (before)", () => {
      const text = "the cat and the dog and the bird";
      // "the" occurs at: 0, 12, 24

      // Hint at 10 should find "the" at 12 (closest)
      const result = findTextPosition(text, "the", 10);
      expect(result?.start).toBe(12);
    });

    it("finds closest occurrence to hint (after)", () => {
      const text = "the cat and the dog and the bird";
      // "the" occurs at: 0, 12, 24

      // Hint at 30 should find "the" at 24 (closest)
      const result = findTextPosition(text, "the", 30);
      expect(result?.start).toBe(24);
    });

    it("finds first occurrence when hint is 0", () => {
      const text = "the cat and the dog and the bird";
      const result = findTextPosition(text, "the", 0);
      expect(result?.start).toBe(0);
    });

    it("finds first occurrence when no hint provided", () => {
      const text = "the cat and the dog and the bird";
      const result = findTextPosition(text, "the");
      expect(result?.start).toBe(0);
    });

    it("handles exact match at hint position", () => {
      const text = "abc abc abc";
      // "abc" occurs at: 0, 4, 8
      const result = findTextPosition(text, "abc", 4);
      expect(result?.start).toBe(4);
    });
  });

  describe("edge cases", () => {
    it("handles single character search", () => {
      const result = findTextPosition("hello", "l");
      expect(result).toEqual({ start: 2, end: 3 });
    });

    it("handles overlapping matches (returns first)", () => {
      const result = findTextPosition("aaa", "aa");
      expect(result).toEqual({ start: 0, end: 2 });
    });

    it("handles multiline content", () => {
      const text = "line one\nline two\nline three";
      const result = findTextPosition(text, "two");
      expect(result).toEqual({ start: 14, end: 17 });
    });

    it("handles unicode", () => {
      const text = "こんにちは世界";
      const result = findTextPosition(text, "世界");
      expect(result).toEqual({ start: 5, end: 7 });
    });

    it("is case sensitive", () => {
      const result = findTextPosition("Hello World", "hello");
      expect(result).toBeUndefined();
    });
  });
});
