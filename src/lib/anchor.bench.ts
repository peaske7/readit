import { bench, describe } from "vitest";
import {
  COMMENTS_1,
  COMMENTS_10,
  COMMENTS_50,
  LARGE_DOC,
  MEDIUM_DOC,
} from "./__fixtures__/bench-data";
import {
  findAnchor,
  findAnchorFuzzy,
  findAnchorNormalized,
  findAnchorWithFallback,
} from "./anchor";

describe("findAnchor — exact match", () => {
  const comment = COMMENTS_10[5];

  bench("medium doc (150 lines)", () => {
    findAnchor({
      source: MEDIUM_DOC,
      selectedText: comment.selectedText,
      lineHint: comment.lineHint ?? "L1",
    });
  });

  bench("large doc (300 lines)", () => {
    findAnchor({
      source: LARGE_DOC,
      selectedText: comment.selectedText,
      lineHint: comment.lineHint ?? "L1",
    });
  });
});

describe("findAnchorNormalized", () => {
  const comment = COMMENTS_10[5];
  const normalizedText = comment.selectedText.replace(/ /g, "  ");

  bench("large doc — normalized whitespace", () => {
    findAnchorNormalized({
      source: LARGE_DOC,
      selectedText: normalizedText,
      lineHint: comment.lineHint ?? "L1",
    });
  });
});

describe("findAnchorFuzzy", () => {
  const comment = COMMENTS_10[5];
  const mutated = `X${comment.selectedText.slice(1, -1)}Z`;

  bench("large doc — fuzzy (mutated text)", () => {
    findAnchorFuzzy({
      source: LARGE_DOC,
      selectedText: mutated.slice(0, 50), // Keep within MAX_FUZZY_TEXT_LENGTH
      lineHint: comment.lineHint ?? "L1",
    });
  });
});

describe("findAnchorWithFallback", () => {
  bench("1 comment — exact hit", () => {
    const c = COMMENTS_1[0];
    findAnchorWithFallback({
      source: LARGE_DOC,
      selectedText: c.selectedText,
      lineHint: c.lineHint ?? "L1",
    });
  });

  bench("10 comments — exact hits", () => {
    for (const c of COMMENTS_10) {
      findAnchorWithFallback({
        source: LARGE_DOC,
        selectedText: c.selectedText,
        lineHint: c.lineHint ?? "L1",
      });
    }
  });

  bench("50 comments — exact hits", () => {
    for (const c of COMMENTS_50) {
      findAnchorWithFallback({
        source: LARGE_DOC,
        selectedText: c.selectedText,
        lineHint: c.lineHint ?? "L1",
      });
    }
  });
});
