const CLUSTER_GAP_PX = 16;
const COMMENT_INPUT_HEIGHT_PX = 160;
const ENTRY_PADDING_PX = 12;

export interface ClusterInput {
  id: string;
  anchorTop: number;
  entryHeight: number;
  entryCount: number;
}

export interface ClusterPosition {
  top: number;
  height: number;
}

function clusterBlockHeight(input: ClusterInput): number {
  return input.entryHeight * input.entryCount + ENTRY_PADDING_PX;
}

export function resolveClusterPositions(
  clusters: ClusterInput[],
  pendingSelectionTop: number | undefined,
): Map<string, ClusterPosition> {
  const sorted = [...clusters].sort((a, b) => a.anchorTop - b.anchorTop);

  const inputStart = pendingSelectionTop ?? Number.POSITIVE_INFINITY;
  const inputEnd =
    pendingSelectionTop !== undefined
      ? pendingSelectionTop + COMMENT_INPUT_HEIGHT_PX
      : Number.POSITIVE_INFINITY;

  const positions = new Map<string, ClusterPosition>();
  let cursor = 0;

  for (const cluster of sorted) {
    const height = clusterBlockHeight(cluster);
    let top = Math.max(cluster.anchorTop, cursor);

    const overlapsInput = top < inputEnd && top + height > inputStart;
    if (overlapsInput) {
      top = inputEnd;
    }

    positions.set(cluster.id, { top, height });
    cursor = top + height + CLUSTER_GAP_PX;
  }

  return positions;
}
