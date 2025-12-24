/**
 * Pure highlighting functions that operate on text content.
 * No DOM dependencies - can run in any JavaScript environment.
 *
 * Functions marked with @iframe are included in the generated iframe runtime.
 */

import type { TextPosition } from "./types";

/**
 * Find text position in content, handling duplicate occurrences.
 * Returns the occurrence closest to hintOffset when multiple exist.
 *
 * @iframe
 */
export function findTextPosition(
  textContent: string,
  selectedText: string,
  hintOffset?: number,
): TextPosition | null {
  if (!selectedText || !textContent) {
    return null;
  }

  const occurrences: number[] = [];
  let idx = 0;

  for (;;) {
    idx = textContent.indexOf(selectedText, idx);
    if (idx === -1) break;
    occurrences.push(idx);
    idx += 1;
  }

  if (occurrences.length === 0) {
    return null;
  }

  if (occurrences.length === 1) {
    return {
      start: occurrences[0],
      end: occurrences[0] + selectedText.length,
    };
  }

  // Multiple occurrences: find closest to hint offset
  const target = hintOffset ?? 0;
  let closest = occurrences[0];
  let minDist = Math.abs(closest - target);

  for (const occ of occurrences) {
    const dist = Math.abs(occ - target);
    if (dist < minDist) {
      minDist = dist;
      closest = occ;
    }
  }

  return {
    start: closest,
    end: closest + selectedText.length,
  };
}

/**
 * Normalize text for comparison (trim whitespace).
 *
 * @iframe
 */
export function normalizeText(text: string): string {
  return text.trim();
}
