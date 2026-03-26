import { bench, describe } from "vitest";
import { COMMENTS_10, COMMENTS_50 } from "./__fixtures__/bench-data";
import { formatComment, generatePrompt } from "./export";

describe("formatComment", () => {
  const comment = COMMENTS_10[0];

  bench("single comment", () => {
    formatComment(comment);
  });
});

describe("generatePrompt", () => {
  bench("10 comments", () => {
    generatePrompt(COMMENTS_10, "benchmark.md");
  });

  bench("50 comments", () => {
    generatePrompt(COMMENTS_50, "benchmark.md");
  });
});
