/**
 * Modular highlighting system for readit.
 *
 * Architecture:
 * - core.ts: Pure functions (no DOM) - findTextPosition
 * - dom.ts: DOM utilities - getTextOffset, applyHighlightToRange, etc.
 * - adapters/: Document-type specific implementations
 *   - markdown.ts: Direct DOM for react-markdown
 *   - iframe.ts: postMessage for HTML in iframe
 * - script-builder.ts: Generates iframe runtime script
 */

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
// Core functions
export { findTextPosition, normalizeText } from "./core";
// DOM utilities
export {
  applyHighlightToRange,
  clearHighlights,
  collectHighlightPositions,
  collectHighlightPositionsViewport,
  collectTextNodes,
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
