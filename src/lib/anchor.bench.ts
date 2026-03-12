import { bench, describe } from "vitest";
import { LARGE_DOC } from "./__fixtures__/bench-data";
import {
  findAnchor,
  findAnchorFuzzy,
  findAnchorNormalized,
  findAnchorWithFallback,
  levenshteinDistance,
} from "./anchor";

// Text known to exist at specific lines in LARGE_DOC
const EXACT_TEXT_L149 =
  "The conclusion of section 8 summarizes the key findings";
const EXACT_TEXT_L250 = "- Item 1 in section 14";
const WHITESPACE_TEXT = "Item 1  in\n  section 14";
const FUZZY_TEXT = "- Item 1 in section 1x"; // 1-char typo

describe("levenshteinDistance", () => {
  const str20 = "hello world testing!";

  bench("identical strings (20 chars)", () => {
    levenshteinDistance(str20, str20);
  });

  bench("1 edit distance (20 chars)", () => {
    levenshteinDistance("hello world testing!", "hello world testinx!");
  });

  bench("maxDistance early exit", () => {
    levenshteinDistance("completely different", "nothing alike here!", 3);
  });

  const longA = "a".repeat(50) + "b".repeat(50);
  const longB = "a".repeat(50) + "c".repeat(50);

  bench("longer strings (100 chars)", () => {
    levenshteinDistance(longA, longB);
  });
});

describe("findAnchor (exact)", () => {
  bench("300-line doc, correct hint", () => {
    findAnchor({
      source: LARGE_DOC,
      selectedText: EXACT_TEXT_L149,
      lineHint: "L149",
    });
  });

  bench("300-line doc, wrong hint (global fallback)", () => {
    findAnchor({
      source: LARGE_DOC,
      selectedText: EXACT_TEXT_L250,
      lineHint: "L10",
    });
  });
});

describe("findAnchorNormalized", () => {
  bench("300-line doc, whitespace-collapsed match", () => {
    findAnchorNormalized({
      source: LARGE_DOC,
      selectedText: WHITESPACE_TEXT,
      lineHint: "L250",
    });
  });
});

describe("findAnchorFuzzy", () => {
  bench("300-line doc, 1-char typo with hint", () => {
    findAnchorFuzzy({
      source: LARGE_DOC,
      selectedText: FUZZY_TEXT,
      lineHint: "L250",
      threshold: 3,
    });
  });

  bench("300-line doc, no hint (full scan)", () => {
    findAnchorFuzzy({
      source: LARGE_DOC,
      selectedText: FUZZY_TEXT,
      threshold: 3,
    });
  });
});

describe("findAnchorWithFallback", () => {
  bench("exact match (fast path)", () => {
    findAnchorWithFallback({
      source: LARGE_DOC,
      selectedText: EXACT_TEXT_L149,
      lineHint: "L149",
    });
  });

  bench("normalized fallback", () => {
    findAnchorWithFallback({
      source: LARGE_DOC,
      selectedText: WHITESPACE_TEXT,
      lineHint: "L250",
    });
  });

  bench("fuzzy fallback", () => {
    findAnchorWithFallback({
      source: LARGE_DOC,
      selectedText: FUZZY_TEXT,
      lineHint: "L250",
    });
  });
});
