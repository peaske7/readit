import { type Anchor, AnchorConfidences } from "../types";
import { getLineNumber } from "./comment-storage";

// Anchor matching configuration
const DEFAULT_SEARCH_WINDOW = 500; // chars before/after line hint for exact match
const DEFAULT_FUZZY_THRESHOLD = 5; // max Levenshtein distance for fuzzy match
const MAX_FUZZY_TEXT_LENGTH = 200; // skip fuzzy matching for texts longer than this
const FUZZY_SEARCH_WINDOW = 2000; // larger window for fuzzy search near line hint

/**
 * Normalize whitespace for comparison: collapse runs of whitespace to single space.
 * This allows matching text that was reformatted (line breaks, indentation changes).
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Calculate Levenshtein distance between two strings.
 * Uses Wagner-Fischer algorithm with O(min(m,n)) space.
 *
 * @param maxDistance Optional early exit threshold. If set, returns Infinity
 *                    when distance is guaranteed to exceed this value.
 */
export function levenshteinDistance(
  a: string,
  b: string,
  maxDistance?: number,
): number {
  // Ensure a is the shorter string for space optimization
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;

  // Early termination for empty strings
  if (m === 0) return n;
  if (n === 0) return m;

  // Early exit: length difference alone exceeds threshold
  if (maxDistance !== undefined && Math.abs(m - n) > maxDistance) {
    return Number.POSITIVE_INFINITY;
  }

  // Use single row for space optimization
  let prevRow = new Array(m + 1);
  let currRow = new Array(m + 1);

  // Initialize first row
  for (let i = 0; i <= m; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= n; j++) {
    currRow[0] = j;

    // Track minimum value in this row for early exit
    let rowMin = currRow[0];

    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1, // deletion
        currRow[i - 1] + 1, // insertion
        prevRow[i - 1] + cost, // substitution
      );
      rowMin = Math.min(rowMin, currRow[i]);
    }

    // Early exit: minimum possible distance exceeds threshold
    if (maxDistance !== undefined && rowMin > maxDistance) {
      return Number.POSITIVE_INFINITY;
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[m];
}

/**
 * Get character offset for the start of a line number (1-indexed).
 */
export function getLineOffset(content: string, lineNumber: number): number {
  if (lineNumber <= 1) return 0;

  let currentLine = 1;

  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") {
      currentLine++;
      if (currentLine === lineNumber) {
        return i + 1;
      }
    }
  }

  return content.length;
}

/**
 * Parse line hint string to get line number(s).
 * Supports "L42" and "L42-45" formats.
 */
export function parseLineHint(lineHint: string): {
  start: number;
  end: number;
} {
  const match = lineHint.match(/^L(\d+)(?:-(\d+))?$/);
  if (!match) {
    return { start: 1, end: 1 };
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  return { start, end };
}

/**
 * Find anchor position for selected text in source content.
 * Uses line hint for fast lookup, falls back to global search.
 */
export function findAnchor(
  source: string,
  selectedText: string,
  lineHint: string,
  options: { searchWindow?: number } = {},
): Anchor | null {
  if (!selectedText || !source) {
    return null;
  }

  const searchWindow = options.searchWindow ?? DEFAULT_SEARCH_WINDOW;
  const { start: hintLine } = parseLineHint(lineHint);

  // Fast path: search near line hint
  const lineOffset = getLineOffset(source, hintLine);
  const windowStart = Math.max(0, lineOffset - searchWindow);
  const windowEnd = Math.min(source.length, lineOffset + searchWindow);
  const window = source.slice(windowStart, windowEnd);

  const localIndex = window.indexOf(selectedText);
  if (localIndex !== -1) {
    const start = windowStart + localIndex;
    const end = start + selectedText.length;
    return {
      start,
      end,
      line: getLineNumber(source, start),
      confidence: AnchorConfidences.EXACT,
    };
  }

  // Fallback: global search
  const globalIndex = source.indexOf(selectedText);
  if (globalIndex !== -1) {
    return {
      start: globalIndex,
      end: globalIndex + selectedText.length,
      line: getLineNumber(source, globalIndex),
      confidence: AnchorConfidences.EXACT,
    };
  }

  return null;
}

/**
 * Build a position map from normalized string positions back to original positions.
 * Returns array where normalizedToOriginal[i] = original position for normalized char i.
 */
function buildNormalizedPositionMap(text: string): {
  normalized: string;
  toOriginal: number[];
} {
  const toOriginal: number[] = [];
  let normalized = "";
  let inWhitespace = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isSpace = /\s/.test(char);

    if (isSpace) {
      if (!inWhitespace && normalized.length > 0) {
        // First whitespace after content - emit single space
        normalized += " ";
        toOriginal.push(i);
      }
      inWhitespace = true;
    } else {
      normalized += char;
      toOriginal.push(i);
      inWhitespace = false;
    }
  }

  // Trim trailing space
  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    toOriginal.pop();
  }

  return { normalized, toOriginal };
}

/**
 * Find anchor using whitespace-normalized matching.
 * Useful when document was reformatted but content is unchanged.
 * Returns "normalized" confidence level.
 *
 * Algorithm:
 * 1. Normalize source and build position map
 * 2. Find normalized text in normalized source (fast substring search)
 * 3. Map positions back to original source
 */
export function findAnchorNormalized(
  source: string,
  selectedText: string,
  lineHint: string,
  options: { searchWindow?: number } = {},
): Anchor | null {
  if (!selectedText || !source) {
    return null;
  }

  const normalizedText = normalizeWhitespace(selectedText);
  if (!normalizedText) {
    return null;
  }

  // Skip if text has no collapsible whitespace (exact match would have worked)
  if (normalizedText === selectedText) {
    return null;
  }

  const searchWindow = options.searchWindow ?? FUZZY_SEARCH_WINDOW;
  const { start: hintLine } = parseLineHint(lineHint);
  const lineOffset = getLineOffset(source, hintLine);

  // Define search window
  const windowStart = Math.max(0, lineOffset - searchWindow);
  const windowEnd = Math.min(source.length, lineOffset + searchWindow);
  const window = source.slice(windowStart, windowEnd);

  // Build normalized version with position mapping
  const { normalized: normalizedWindow, toOriginal } =
    buildNormalizedPositionMap(window);

  // Fast substring search on normalized text
  const normalizedIndex = normalizedWindow.indexOf(normalizedText);
  if (normalizedIndex !== -1) {
    // Map back to original positions
    const originalStart = windowStart + toOriginal[normalizedIndex];
    const endNormIndex = normalizedIndex + normalizedText.length - 1;
    // Find original end: scan forward from mapped position to include trailing whitespace
    let originalEnd = windowStart + toOriginal[endNormIndex] + 1;
    // Extend to include any trailing whitespace that was collapsed
    while (originalEnd < source.length && /\s/.test(source[originalEnd])) {
      originalEnd++;
    }

    return {
      start: originalStart,
      end: originalEnd,
      line: getLineNumber(source, originalStart),
      confidence: AnchorConfidences.NORMALIZED,
    };
  }

  // Global fallback (outside hint window)
  const { normalized: fullNormalized, toOriginal: fullToOriginal } =
    buildNormalizedPositionMap(source);
  const globalIndex = fullNormalized.indexOf(normalizedText);
  if (globalIndex !== -1) {
    const originalStart = fullToOriginal[globalIndex];
    const endNormIndex = globalIndex + normalizedText.length - 1;
    let originalEnd = fullToOriginal[endNormIndex] + 1;
    while (originalEnd < source.length && /\s/.test(source[originalEnd])) {
      originalEnd++;
    }

    return {
      start: originalStart,
      end: originalEnd,
      line: getLineNumber(source, originalStart),
      confidence: AnchorConfidences.NORMALIZED,
    };
  }

  return null;
}

/**
 * Find anchor using fuzzy matching with Levenshtein distance.
 * Scans the source for substrings similar to the selected text.
 */
export function findAnchorFuzzy(
  source: string,
  selectedText: string,
  options: { threshold?: number; lineHint?: string } = {},
): Anchor | null {
  if (!selectedText || !source) {
    return null;
  }

  const threshold = options.threshold ?? DEFAULT_FUZZY_THRESHOLD;
  const textLen = selectedText.length;

  // For very long texts, skip fuzzy matching (too expensive)
  if (textLen > MAX_FUZZY_TEXT_LENGTH) {
    return null;
  }

  let bestMatch: Anchor | null = null;
  let bestDistance = threshold + 1;

  // Determine search range based on line hint
  let searchStart = 0;
  let searchEnd = source.length;

  if (options.lineHint) {
    const { start: hintLine } = parseLineHint(options.lineHint);
    const lineOffset = getLineOffset(source, hintLine);
    // Search in a larger window for fuzzy matching
    searchStart = Math.max(0, lineOffset - FUZZY_SEARCH_WINDOW);
    searchEnd = Math.min(source.length, lineOffset + FUZZY_SEARCH_WINDOW);
  }

  // Slide window of similar length through the search range
  const minLen = Math.max(1, textLen - threshold);
  const maxLen = textLen + threshold;

  for (let len = minLen; len <= maxLen; len++) {
    for (let i = searchStart; i <= searchEnd - len; i++) {
      const candidate = source.slice(i, i + len);
      // Use early exit: only compute if distance could improve on current best
      const distance = levenshteinDistance(
        selectedText,
        candidate,
        bestDistance - 1,
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = {
          start: i,
          end: i + len,
          line: getLineNumber(source, i),
          confidence: AnchorConfidences.FUZZY,
          distance,
        };

        // Early exit if we found an exact match
        if (distance === 0) {
          return bestMatch;
        }
      }
    }
  }

  return bestMatch;
}

/**
 * Find anchor with fallback chain: exact → normalized → fuzzy.
 *
 * Matching strategies in order of preference:
 * 1. Exact: Fast substring match (O(n))
 * 2. Normalized: Whitespace-collapsed match for reformatted text (O(n))
 * 3. Fuzzy: Levenshtein distance for small edits (O(n × m × threshold))
 */
export function findAnchorWithFallback(
  source: string,
  selectedText: string,
  lineHint: string,
  options: { fuzzyThreshold?: number } = {},
): Anchor | null {
  // Try exact match first (fastest)
  const exactMatch = findAnchor(source, selectedText, lineHint);
  if (exactMatch) {
    return exactMatch;
  }

  // Try normalized match (handles reformatting)
  const normalizedMatch = findAnchorNormalized(source, selectedText, lineHint);
  if (normalizedMatch) {
    return normalizedMatch;
  }

  // Fall back to fuzzy matching (handles small edits)
  return findAnchorFuzzy(source, selectedText, {
    threshold: options.fuzzyThreshold,
    lineHint,
  });
}

/**
 * Find the closest match when multiple occurrences exist.
 */
export function findClosestOccurrence(
  source: string,
  selectedText: string,
  lineHint: string,
): Anchor | null {
  if (!selectedText || !source) {
    return null;
  }

  const { start: hintLine } = parseLineHint(lineHint);
  const targetOffset = getLineOffset(source, hintLine);

  let bestMatch: Anchor | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = 0;

  while (true) {
    const foundIndex = source.indexOf(selectedText, index);
    if (foundIndex === -1) break;

    const distance = Math.abs(foundIndex - targetOffset);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = {
        start: foundIndex,
        end: foundIndex + selectedText.length,
        line: getLineNumber(source, foundIndex),
        confidence: AnchorConfidences.EXACT,
      };
    }

    index = foundIndex + 1;
  }

  return bestMatch;
}
