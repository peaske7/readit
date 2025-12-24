/**
 * Color palette for comment highlights.
 * Colors are assigned by document position (top-to-bottom).
 */

export const COMMENT_COLORS = [
  {
    name: "amber",
    bg: "rgba(245, 222, 160, 0.5)",
    bgFocused: "rgba(228, 195, 110, 0.65)",
    border: "#c9a84a",
    text: "#8b6914",
  },
  {
    name: "blue",
    bg: "rgba(168, 196, 228, 0.5)",
    bgFocused: "rgba(130, 168, 210, 0.65)",
    border: "#5b7fa8",
    text: "#3d5f8a",
  },
  {
    name: "green",
    bg: "rgba(170, 210, 170, 0.5)",
    bgFocused: "rgba(130, 185, 135, 0.65)",
    border: "#5a9a62",
    text: "#3d6e45",
  },
  {
    name: "rose",
    bg: "rgba(225, 180, 185, 0.5)",
    bgFocused: "rgba(205, 145, 155, 0.65)",
    border: "#b86b78",
    text: "#8a4a55",
  },
] as const;

export type CommentColor = (typeof COMMENT_COLORS)[number];
