import { describe, expect, it } from "vitest";
import { type ClusterInput, resolveClusterPositions } from "./margin-layout";

function cluster(
  id: string,
  anchorTop: number,
  count = 1,
  height = 50,
): ClusterInput {
  return { id, anchorTop, entryCount: count, entryHeight: height };
}

describe("resolveClusterPositions", () => {
  it("places a single cluster at its anchor top", () => {
    const result = resolveClusterPositions([cluster("a", 100)], undefined);
    expect(result.get("a")?.top).toBe(100);
  });

  it("prevents overlap by pushing the next cluster down", () => {
    const result = resolveClusterPositions(
      [cluster("a", 100, 2, 50), cluster("b", 110, 1, 50)],
      undefined,
    );
    expect(result.get("a")?.top).toBe(100);
    const bTop = result.get("b")?.top ?? 0;
    expect(bTop).toBeGreaterThanOrEqual(100 + (2 * 50 + 12));
  });

  it("respects anchor when the next cluster is far below the previous one", () => {
    const result = resolveClusterPositions(
      [cluster("a", 0), cluster("b", 1000)],
      undefined,
    );
    expect(result.get("b")?.top).toBe(1000);
  });

  it("avoids overlapping the comment-input slot", () => {
    const result = resolveClusterPositions([cluster("a", 500, 1, 50)], 450);
    const top = result.get("a")?.top ?? 0;
    expect(top).toBeGreaterThanOrEqual(450 + 160);
  });

  it("sorts clusters by anchor top regardless of input order", () => {
    const result = resolveClusterPositions(
      [cluster("late", 200), cluster("early", 0)],
      undefined,
    );
    expect(result.get("early")?.top).toBe(0);
    expect(result.get("late")?.top).toBe(200);
  });

  it("uses entryHeight × entryCount for the cluster footprint", () => {
    const result = resolveClusterPositions(
      [cluster("a", 0, 3, 24), cluster("b", 10)],
      undefined,
    );
    const aBottom =
      (result.get("a")?.top ?? 0) + (result.get("a")?.height ?? 0);
    expect(result.get("b")?.top).toBeGreaterThanOrEqual(aBottom);
  });
});
