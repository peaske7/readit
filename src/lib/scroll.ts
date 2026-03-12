/**
 * Scroll calculation utilities for TOC navigation.
 * These pure functions enable unit testing of scroll position calculations.
 */

/**
 * Parameters for scroll target calculation.
 * Using object destructuring per style guide §3.5 for clarity.
 */
export interface CalculateScrollTargetParams {
  elementTop: number;
  viewportHeight: number;
  offsetPercent?: number;
}

export interface GetElementTopParams {
  elementRect: { top: number };
  scrollY: number;
  iframeTopOffset?: number;
}

/**
 * Calculate the scroll target position to place an element at a comfortable
 * reading position (default: 25% from top of viewport).
 */
export function calculateScrollTarget({
  elementTop,
  viewportHeight,
  offsetPercent = 0.25,
}: CalculateScrollTargetParams): number {
  const targetOffset = viewportHeight * offsetPercent;
  return Math.max(0, elementTop - targetOffset);
}

/**
 * Get an element's absolute position in the main document.
 *
 * For elements directly in the document: pass scrollY and the element.
 * For elements inside an iframe: also pass the iframe's top offset.
 */
export function getElementTopInDocument({
  elementRect,
  scrollY,
  iframeTopOffset,
}: GetElementTopParams): number {
  return scrollY + (iframeTopOffset ?? 0) + elementRect.top;
}
