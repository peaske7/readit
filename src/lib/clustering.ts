import type { Comment } from "../schema";

export const TierTypes = {
  TIER_1: "tier-1",
  TIER_2: "tier-2",
  TIER_3: "tier-3",
  GROUP: "group",
} as const;

export type TierType = (typeof TierTypes)[keyof typeof TierTypes];

export interface TierSpec {
  type: TierType;
  height: number;
}

const TIER_1: TierSpec = { type: TierTypes.TIER_1, height: 50 };
const TIER_2: TierSpec = { type: TierTypes.TIER_2, height: 38 };
const TIER_3: TierSpec = { type: TierTypes.TIER_3, height: 24 };
const GROUP: TierSpec = { type: TierTypes.GROUP, height: 50 };

export function selectTier(count: number): TierSpec {
  if (count >= 13) return GROUP;
  if (count >= 7) return TIER_3;
  if (count >= 4) return TIER_2;
  return TIER_1;
}

export interface Cluster {
  id: string;
  comments: Comment[];
  tier: TierSpec;
}

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "PRE",
  "BLOCKQUOTE",
  "LI",
  "TR",
  "TD",
  "TH",
]);

export function findBlockAncestor(node: Node): Element | null {
  let el: Element | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  while (el && !BLOCK_TAGS.has(el.tagName)) {
    el = el.parentElement;
  }
  return el;
}

export function buildClusters(
  sortedComments: Comment[],
  paragraphOf: (commentId: string) => Element | null,
): Cluster[] {
  const result: Cluster[] = [];
  let current: Cluster | null = null;
  let currentEl: Element | null = null;

  for (const comment of sortedComments) {
    const el = paragraphOf(comment.id);
    if (!el) continue;

    if (el === currentEl && current) {
      current.comments.push(comment);
      continue;
    }

    const id = `cluster:${result.length}`;
    current = { id, comments: [comment], tier: TIER_1 };
    currentEl = el;
    result.push(current);
  }

  for (const cluster of result) {
    cluster.tier = selectTier(cluster.comments.length);
  }

  return result;
}
