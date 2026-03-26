import { bench, describe } from "vitest";
import {
  COMMENTS_1,
  COMMENTS_10,
  COMMENTS_50,
} from "./__fixtures__/bench-data";
import { resolveMarginNotePositions } from "./margin-layout";

function makeHighlightPositions(
  commentIds: string[],
  spacing: number,
): Record<string, number> {
  const positions: Record<string, number> = {};
  for (let i = 0; i < commentIds.length; i++) {
    positions[commentIds[i]] = i * spacing;
  }
  return positions;
}

describe("resolveMarginNotePositions — well-spaced", () => {
  bench("1 comment", () => {
    const ids = COMMENTS_1.map((c) => c.id);
    const positions = makeHighlightPositions(ids, 300);
    resolveMarginNotePositions(ids, positions, undefined);
  });

  bench("10 comments", () => {
    const ids = COMMENTS_10.map((c) => c.id);
    const positions = makeHighlightPositions(ids, 300);
    resolveMarginNotePositions(ids, positions, undefined);
  });

  bench("50 comments", () => {
    const ids = COMMENTS_50.map((c) => c.id);
    const positions = makeHighlightPositions(ids, 300);
    resolveMarginNotePositions(ids, positions, undefined);
  });
});

describe("resolveMarginNotePositions — clustered", () => {
  bench("10 comments, 10px apart", () => {
    const ids = COMMENTS_10.map((c) => c.id);
    const positions = makeHighlightPositions(ids, 10);
    resolveMarginNotePositions(ids, positions, undefined);
  });

  bench("50 comments, 10px apart", () => {
    const ids = COMMENTS_50.map((c) => c.id);
    const positions = makeHighlightPositions(ids, 10);
    resolveMarginNotePositions(ids, positions, undefined);
  });
});

describe("resolveMarginNotePositions — with input zone", () => {
  bench("50 comments, input at middle", () => {
    const ids = COMMENTS_50.map((c) => c.id);
    const positions = makeHighlightPositions(ids, 100);
    const midpoint = 25 * 100;
    resolveMarginNotePositions(ids, positions, midpoint);
  });
});
