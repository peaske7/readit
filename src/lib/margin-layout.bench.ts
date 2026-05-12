import { bench, describe } from "vitest";
import { type ClusterInput, resolveClusterPositions } from "./margin-layout";

function makeClusters(count: number, spacing: number): ClusterInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c-${i}`,
    anchorTop: i * spacing,
    entryHeight: 50,
    entryCount: 1,
  }));
}

describe("resolveClusterPositions — well-spaced", () => {
  bench("1 cluster", () => {
    resolveClusterPositions(makeClusters(1, 300), undefined);
  });

  bench("10 clusters", () => {
    resolveClusterPositions(makeClusters(10, 300), undefined);
  });

  bench("50 clusters", () => {
    resolveClusterPositions(makeClusters(50, 300), undefined);
  });
});

describe("resolveClusterPositions — packed", () => {
  bench("10 clusters, 10px apart", () => {
    resolveClusterPositions(makeClusters(10, 10), undefined);
  });

  bench("50 clusters, 10px apart", () => {
    resolveClusterPositions(makeClusters(50, 10), undefined);
  });
});

describe("resolveClusterPositions — with input zone", () => {
  bench("50 clusters, input at middle", () => {
    const clusters = makeClusters(50, 100);
    resolveClusterPositions(clusters, 25 * 100);
  });
});
