import { describe, expect, it } from "vitest";
import type { Comment } from "../schema";
import { buildClusters, selectTier, TierTypes } from "./clustering";

function mkComment(id: string, start: number): Comment {
  return {
    id,
    selectedText: id,
    comment: id,
    startOffset: start,
    endOffset: start + 1,
  };
}

describe("selectTier", () => {
  it("1-3 comments → tier 1 (50px, 3 lines)", () => {
    expect(selectTier(1)).toEqual({ type: TierTypes.TIER_1, height: 50 });
    expect(selectTier(3)).toEqual({ type: TierTypes.TIER_1, height: 50 });
  });

  it("4-6 comments → tier 2 (38px, 2 lines)", () => {
    expect(selectTier(4)).toEqual({ type: TierTypes.TIER_2, height: 38 });
    expect(selectTier(6)).toEqual({ type: TierTypes.TIER_2, height: 38 });
  });

  it("7-12 comments → tier 3 (24px, 1 line)", () => {
    expect(selectTier(7)).toEqual({ type: TierTypes.TIER_3, height: 24 });
    expect(selectTier(12)).toEqual({ type: TierTypes.TIER_3, height: 24 });
  });

  it("13+ comments → group (50px, aggregated)", () => {
    expect(selectTier(13)).toEqual({ type: TierTypes.GROUP, height: 50 });
    expect(selectTier(50)).toEqual({ type: TierTypes.GROUP, height: 50 });
  });
});

describe("buildClusters", () => {
  it("groups comments sharing a paragraph", () => {
    const p1 = { tagName: "P" } as Element;
    const p2 = { tagName: "P" } as Element;
    const comments = [
      mkComment("a", 0),
      mkComment("b", 5),
      mkComment("c", 100),
    ];
    const paragraphOf = (id: string) => (id === "c" ? p2 : p1);
    const clusters = buildClusters(comments, paragraphOf);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].comments.map((c) => c.id)).toEqual(["a", "b"]);
    expect(clusters[1].comments.map((c) => c.id)).toEqual(["c"]);
  });

  it("skips comments with no paragraph", () => {
    const p1 = { tagName: "P" } as Element;
    const comments = [mkComment("a", 0), mkComment("b", 5)];
    const paragraphOf = (id: string) => (id === "a" ? p1 : null);
    const clusters = buildClusters(comments, paragraphOf);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].comments.map((c) => c.id)).toEqual(["a"]);
  });

  it("starts a new cluster on paragraph change even with same element later", () => {
    const p1 = { tagName: "P" } as Element;
    const p2 = { tagName: "P" } as Element;
    const comments = [
      mkComment("a", 0),
      mkComment("b", 5),
      mkComment("c", 10),
      mkComment("d", 15),
    ];
    const paragraphOf = (id: string) => {
      if (id === "a" || id === "b") return p1;
      if (id === "c") return p2;
      return p1;
    };
    const clusters = buildClusters(comments, paragraphOf);
    expect(clusters).toHaveLength(3);
    expect(clusters.map((c) => c.comments.length)).toEqual([2, 1, 1]);
  });

  it("assigns tier based on comment count", () => {
    const p1 = { tagName: "P" } as Element;
    const comments = Array.from({ length: 5 }, (_, i) => mkComment(`c${i}`, i));
    const clusters = buildClusters(comments, () => p1);
    expect(clusters[0].tier.type).toBe(TierTypes.TIER_2);
  });
});
