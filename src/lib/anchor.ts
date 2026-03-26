import { type Anchor, AnchorConfidences } from "../schema";
import { getLineNumber } from "./comment-storage";

const DEFAULT_SEARCH_WINDOW = 500;
const DEFAULT_FUZZY_THRESHOLD = 5;
const MAX_FUZZY_TEXT_LENGTH = 200;
const FUZZY_SEARCH_WINDOW = 2000;

export interface FindAnchorParams {
  source: string;
  selectedText: string;
  lineHint: string;
  searchWindow?: number;
}

export interface FindAnchorFuzzyParams {
  source: string;
  selectedText: string;
  lineHint?: string;
  threshold?: number;
}

export interface FindAnchorWithFallbackParams {
  source: string;
  selectedText: string;
  lineHint: string;
  fuzzyThreshold?: number;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Wagner-Fischer with O(min(m,n)) space. Returns Infinity when > maxDistance. */
export function levenshteinDistance(
  a: string,
  b: string,
  maxDistance?: number,
): number {
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  if (maxDistance !== undefined && Math.abs(m - n) > maxDistance) {
    return Number.POSITIVE_INFINITY;
  }

  let prevRow = new Array(m + 1);
  let currRow = new Array(m + 1);

  for (let i = 0; i <= m; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= n; j++) {
    currRow[0] = j;

    let rowMin = currRow[0];

    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1,
        currRow[i - 1] + 1,
        prevRow[i - 1] + cost,
      );
      rowMin = Math.min(rowMin, currRow[i]);
    }

    if (maxDistance !== undefined && rowMin > maxDistance) {
      return Number.POSITIVE_INFINITY;
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[m];
}

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

/** Supports "L42", "L42-L55", and legacy "L42-45" format. */
export function parseLineHint(lineHint: string): {
  start: number;
  end: number;
} {
  const match = lineHint.match(/^L(\d+)(?:-L?(\d+))?$/);
  if (!match) {
    return { start: 1, end: 1 };
  }

  const start = Number.parseInt(match[1], 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : start;
  return { start, end };
}

export function findAnchor({
  source,
  selectedText,
  lineHint,
  searchWindow = DEFAULT_SEARCH_WINDOW,
}: FindAnchorParams): Anchor | undefined {
  if (!selectedText || !source) {
    return undefined;
  }
  const { start: hintLine } = parseLineHint(lineHint);

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

  const globalIndex = source.indexOf(selectedText);
  if (globalIndex !== -1) {
    return {
      start: globalIndex,
      end: globalIndex + selectedText.length,
      line: getLineNumber(source, globalIndex),
      confidence: AnchorConfidences.EXACT,
    };
  }

  return undefined;
}

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

  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    toOriginal.pop();
  }

  return { normalized, toOriginal };
}

export function findAnchorNormalized({
  source,
  selectedText,
  lineHint,
  searchWindow = FUZZY_SEARCH_WINDOW,
}: FindAnchorParams): Anchor | undefined {
  if (!selectedText || !source) {
    return undefined;
  }

  const normalizedText = normalizeWhitespace(selectedText);
  if (!normalizedText) {
    return undefined;
  }

  if (normalizedText === selectedText) {
    return undefined;
  }
  const { start: hintLine } = parseLineHint(lineHint);
  const lineOffset = getLineOffset(source, hintLine);

  const windowStart = Math.max(0, lineOffset - searchWindow);
  const windowEnd = Math.min(source.length, lineOffset + searchWindow);
  const window = source.slice(windowStart, windowEnd);

  const { normalized: normalizedWindow, toOriginal } =
    buildNormalizedPositionMap(window);

  const normalizedIndex = normalizedWindow.indexOf(normalizedText);
  if (normalizedIndex !== -1) {
    const originalStart = windowStart + toOriginal[normalizedIndex];
    const endNormIndex = normalizedIndex + normalizedText.length - 1;
    let originalEnd = windowStart + toOriginal[endNormIndex] + 1;
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

  return undefined;
}

export function findAnchorFuzzy({
  source,
  selectedText,
  lineHint,
  threshold = DEFAULT_FUZZY_THRESHOLD,
}: FindAnchorFuzzyParams): Anchor | undefined {
  if (!selectedText || !source) {
    return undefined;
  }

  const textLen = selectedText.length;

  if (textLen > MAX_FUZZY_TEXT_LENGTH) {
    return undefined;
  }

  let bestMatch: Anchor | undefined;
  let bestDistance = threshold + 1;

  let searchStart = 0;
  let searchEnd = source.length;

  if (lineHint) {
    const { start: hintLine } = parseLineHint(lineHint);
    const lineOffset = getLineOffset(source, hintLine);
    searchStart = Math.max(0, lineOffset - FUZZY_SEARCH_WINDOW);
    searchEnd = Math.min(source.length, lineOffset + FUZZY_SEARCH_WINDOW);
  }

  const minLen = Math.max(1, textLen - threshold);
  const maxLen = textLen + threshold;

  for (let len = minLen; len <= maxLen; len++) {
    for (let i = searchStart; i <= searchEnd - len; i++) {
      const candidate = source.slice(i, i + len);
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

        if (distance === 0) {
          return bestMatch;
        }
      }
    }
  }

  return bestMatch;
}

export function findAnchorWithFallback({
  source,
  selectedText,
  lineHint,
  fuzzyThreshold,
}: FindAnchorWithFallbackParams): Anchor | undefined {
  const exactMatch = findAnchor({ source, selectedText, lineHint });
  if (exactMatch) {
    return exactMatch;
  }

  const normalizedMatch = findAnchorNormalized({
    source,
    selectedText,
    lineHint,
  });
  if (normalizedMatch) {
    return normalizedMatch;
  }

  return findAnchorFuzzy({
    source,
    selectedText,
    lineHint,
    threshold: fuzzyThreshold,
  });
}

export function findClosestOccurrence({
  source,
  selectedText,
  lineHint,
}: Omit<FindAnchorParams, "searchWindow">): Anchor | undefined {
  if (!selectedText || !source) {
    return undefined;
  }

  const { start: hintLine } = parseLineHint(lineHint);
  const targetOffset = getLineOffset(source, hintLine);

  let bestMatch: Anchor | undefined;
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
