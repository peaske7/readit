import { bench, describe } from "vitest";
import {
  COMMENT_FILE_LARGE,
  COMMENT_FILE_MEDIUM,
  COMMENT_FILE_OBJ_LARGE,
  COMMENT_FILE_OBJ_MEDIUM,
  COMMENT_FILE_SMALL,
  LARGE_DOC,
} from "./__fixtures__/bench-data";
import {
  computeHash,
  createComment,
  parseCommentFile,
  serializeComments,
} from "./comment-storage";

describe("parseCommentFile", () => {
  bench("1 comment", () => {
    parseCommentFile(COMMENT_FILE_SMALL);
  });

  bench("10 comments", () => {
    parseCommentFile(COMMENT_FILE_MEDIUM);
  });

  bench("50 comments", () => {
    parseCommentFile(COMMENT_FILE_LARGE);
  });
});

describe("serializeComments", () => {
  bench("10 comments", () => {
    serializeComments(COMMENT_FILE_OBJ_MEDIUM);
  });

  bench("50 comments", () => {
    serializeComments(COMMENT_FILE_OBJ_LARGE);
  });
});

describe("computeHash", () => {
  const shortString = "x".repeat(100);

  bench("short string (100 chars)", () => {
    computeHash(shortString);
  });

  bench("large doc (~10k chars)", () => {
    computeHash(LARGE_DOC);
  });
});

describe("createComment", () => {
  bench("short selection", () => {
    createComment("selected text here", "my comment", 100, 118, LARGE_DOC);
  });

  const longSelection = "a".repeat(2000);

  bench("long selection (triggers truncation)", () => {
    createComment(longSelection, "my comment", 0, 2000, LARGE_DOC);
  });
});
