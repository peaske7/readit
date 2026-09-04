import { describe, expect, it } from "vitest";
import type { Comment } from "../schema";
import { mergeComments } from "./merge-comments";

const c = (id: string, comment = id): Comment => ({
  id,
  comment,
  selectedText: "x",
  startOffset: 0,
  endOffset: 1,
});

describe("mergeComments", () => {
  it("takes the remote version of published comments", () => {
    const merged = mergeComments({
      local: [c("a", "old")],
      remote: [c("a", "new")],
      publishedIds: ["a"],
    });
    expect(merged).toEqual([c("a", "new")]);
  });

  it("drops comments that were published and deleted remotely", () => {
    const merged = mergeComments({
      local: [c("a")],
      remote: [],
      publishedIds: ["a"],
    });
    expect(merged).toEqual([]);
  });

  it("keeps comments added locally after publish", () => {
    const merged = mergeComments({
      local: [c("a")],
      remote: [],
      publishedIds: [],
    });
    expect(merged).toEqual([c("a")]);
  });

  it("appends comments added on the web", () => {
    const merged = mergeComments({
      local: [c("a")],
      remote: [c("a"), c("b")],
      publishedIds: ["a"],
    });
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("keeps local order and appends remote-only comments after it", () => {
    const merged = mergeComments({
      local: [c("a"), c("local-new"), c("b")],
      remote: [c("b"), c("web-new"), c("a")],
      publishedIds: ["a", "b"],
    });
    expect(merged.map((m) => m.id)).toEqual(["a", "local-new", "b", "web-new"]);
  });

  it("returns the remote set when there is no local file", () => {
    const merged = mergeComments({
      local: [],
      remote: [c("a")],
      publishedIds: [],
    });
    expect(merged).toEqual([c("a")]);
  });
});
