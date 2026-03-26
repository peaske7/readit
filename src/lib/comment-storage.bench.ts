import { bench, describe } from "vitest";
import {
  COMMENT_FILE_LARGE,
  COMMENT_FILE_MEDIUM,
  COMMENT_FILE_OBJ_LARGE,
  COMMENT_FILE_OBJ_MEDIUM,
  COMMENT_FILE_OBJ_SMALL,
  COMMENT_FILE_SMALL,
  LARGE_DOC,
} from "./__fixtures__/bench-data";
import {
  computeHash,
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
  bench("1 comment", () => {
    serializeComments(COMMENT_FILE_OBJ_SMALL);
  });

  bench("10 comments", () => {
    serializeComments(COMMENT_FILE_OBJ_MEDIUM);
  });

  bench("50 comments", () => {
    serializeComments(COMMENT_FILE_OBJ_LARGE);
  });
});

describe("computeHash", () => {
  bench("300-line document", () => {
    computeHash(LARGE_DOC);
  });
});
