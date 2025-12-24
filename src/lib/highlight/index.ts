// Highlighter (unified adapter)

export type { CommentColor } from "./colors";
// Colors
export { COMMENT_COLORS } from "./colors";
export type {
  Highlighter,
  HighlighterOptions,
  HoverHandler,
  PositionChangeHandler,
  SelectionHandler,
} from "./highlighter";
export { createHighlighter } from "./highlighter";

// Script builder (needed by IframeContainer)
export { buildIframeScript } from "./script-builder";

// Types (public API)
export type {
  HighlightComment,
  HighlightPositions,
  HighlightStyle,
} from "./types";
