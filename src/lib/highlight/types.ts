/**
 * Shared types for the highlighting system.
 */

/**
 * Style configuration for highlight marks.
 */
export interface HighlightStyle {
  attribute: string;
  attributeValue: string;
}

/**
 * Text range with character offsets.
 */
export interface TextRange {
  startOffset: number;
  endOffset: number;
}

/**
 * Resolved text position in content.
 */
export interface TextPosition {
  start: number;
  end: number;
}

/**
 * Comment data needed for highlighting (subset of full Comment type).
 */
export interface HighlightComment {
  id: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Highlight positions for margin note alignment and minimap.
 * - positions: Y-position relative to container (for margin notes)
 * - documentPositions: Y-position from document top (for minimap)
 */
export interface HighlightPositions {
  positions: Record<string, number>;
  documentPositions: Record<string, number>;
  pendingTop?: number;
}

/**
 * Text node with its cumulative offset range in the document.
 */
export interface TextNodeInfo {
  node: Text;
  start: number;
  end: number;
}
