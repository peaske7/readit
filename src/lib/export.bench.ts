import { bench, describe } from "vitest";
import {
  COMMENTS_1,
  COMMENTS_10,
  COMMENTS_50,
} from "./__fixtures__/bench-data";
import { generatePrompt, generateRawText } from "./export";

describe("generatePrompt", () => {
  bench("1 comment", () => {
    generatePrompt(COMMENTS_1, "test.md");
  });

  bench("10 comments", () => {
    generatePrompt(COMMENTS_10, "test.md");
  });

  bench("50 comments", () => {
    generatePrompt(COMMENTS_50, "test.md");
  });
});

describe("generateRawText", () => {
  bench("1 comment", () => {
    generateRawText(COMMENTS_1);
  });

  bench("10 comments", () => {
    generateRawText(COMMENTS_10);
  });

  bench("50 comments", () => {
    generateRawText(COMMENTS_50);
  });
});
