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
 * Text node with its cumulative offset range in the document.
 */
export interface TextNodeInfo {
  node: Text;
  start: number;
  end: number;
}
