/**
 * Adapter interface for document type-specific highlighting.
 * Each document type (Markdown, HTML iframe, future PDF) implements this.
 */

import type { HighlightComment, HighlightPositions, TextRange } from "../types";

/**
 * Selection handler callback type.
 */
export type SelectionHandler = (
  text: string,
  startOffset: number,
  endOffset: number,
) => void;

/**
 * Position change callback type.
 */
export type PositionChangeHandler = (positions: HighlightPositions) => void;

/**
 * Hover callback type.
 */
export type HoverHandler = (commentId: string | null) => void;

/**
 * Adapter interface for document highlighting.
 * Abstracts the differences between rendering contexts (direct DOM, iframe, etc.)
 */
export interface HighlightAdapter {
  /**
   * Apply highlights to comments and optional pending selection.
   */
  applyHighlights(
    comments: HighlightComment[],
    pendingSelection?: TextRange,
  ): void;

  /**
   * Clear all existing highlights.
   */
  clearHighlights(): void;

  /**
   * Get current highlight positions for margin note alignment.
   */
  getPositions(): HighlightPositions;

  /**
   * Subscribe to position changes (scroll, resize).
   * Returns unsubscribe function.
   */
  onPositionsChange(callback: PositionChangeHandler): () => void;

  /**
   * Subscribe to hover events on highlights.
   * Returns unsubscribe function.
   */
  onHighlightHover(callback: HoverHandler): () => void;

  /**
   * Cleanup resources (event listeners, etc.)
   */
  dispose(): void;
}
