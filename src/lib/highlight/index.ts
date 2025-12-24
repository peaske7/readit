export type {
  ContentHeightHandler,
  IframeAdapterOptions,
  IframeHighlightAdapter,
} from "./adapters/iframe";
export { createIframeAdapter } from "./adapters/iframe";
export type { MarkdownAdapterOptions } from "./adapters/markdown";
export { createMarkdownAdapter } from "./adapters/markdown";
// Adapters
export type {
  HighlightAdapter,
  HoverHandler,
  PositionChangeHandler,
  SelectionHandler,
} from "./adapters/types";
export type { CommentColor } from "./colors";
// Colors
export { COMMENT_COLORS } from "./colors";
// Core functions
export { findTextPosition } from "./core";
export type { ExtendedHighlightStyle } from "./dom";
// DOM utilities
export {
  applyHighlightToRange,
  applyHighlightWithStyle,
  clearHighlights,
  collectHighlightPositions,
  collectHighlightPositionsViewport,
  collectTextNodes,
  countLinesInRange,
  getDOMTextContent,
  getTextOffset,
} from "./dom";
// Script builder
export { buildIframeScript } from "./script-builder";
// Types
export type {
  HighlightComment,
  HighlightPositions,
  HighlightStyle,
  TextNodeInfo,
  TextPosition,
  TextRange,
} from "./types";
