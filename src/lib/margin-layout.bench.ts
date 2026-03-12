import { bench, describe } from "vitest";
import { makeHighlightPositions } from "./__fixtures__/bench-data";
import { resolveMarginNotePositions } from "./margin-layout";

// Pre-compute fixture data outside bench loops
const ids5 = Array.from({ length: 5 }, (_, i) => `c${i}`);
const pos5 = makeHighlightPositions(5);

const ids50 = Array.from({ length: 50 }, (_, i) => `c${i}`);
const pos50 = makeHighlightPositions(50);

describe("resolveMarginNotePositions", () => {
  bench("5 notes, no input zone", () => {
    resolveMarginNotePositions(ids5, pos5, undefined);
  });

  bench("5 notes, with input zone collision", () => {
    resolveMarginNotePositions(ids5, pos5, 400);
  });

  bench("50 notes, no input zone", () => {
    resolveMarginNotePositions(ids50, pos50, undefined);
  });

  bench("50 notes, with input zone collision", () => {
    resolveMarginNotePositions(ids50, pos50, 3000);
  });
});
