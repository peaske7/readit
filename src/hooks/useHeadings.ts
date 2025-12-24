import { useMemo } from "react";
import { slugify } from "../lib/utils";
import type { DocumentType } from "../types";

export interface Heading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Extract headings from markdown content
 */
function parseMarkdownHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const seenIds = new Map<string, number>();

  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match = regex.exec(content);

  while (match !== null) {
    const level = match[1].length as 1 | 2 | 3 | 4 | 5 | 6;
    const text = match[2].trim();
    const baseId = slugify(text);
    const count = seenIds.get(baseId) ?? 0;
    const id = count > 0 ? `${baseId}-${count}` : baseId;
    seenIds.set(baseId, count + 1);

    headings.push({ id, text, level });
    match = regex.exec(content);
  }

  return headings;
}

/**
 * Generate ID matching the iframe's ensureHeadingIds algorithm.
 * Note: This differs from utils/slugify - it strips underscores to match
 * the iframe script's ID generation exactly.
 */
function generateHeadingId(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/ +/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Extract headings from HTML content
 */
function parseHtmlHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const seenIds = new Map<string, number>();

  // Match h1-h6 tags, capturing attributes and text content
  const regex = /<h([1-6])([^>]*)>([^<]+)<\/h\1>/gi;
  let match = regex.exec(content);

  while (match !== null) {
    const level = Number.parseInt(match[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
    const attributes = match[2];
    // Strip any remaining HTML tags and decode entities
    const text = match[3]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();

    if (text) {
      // Extract existing id attribute if present
      const idMatch = /\sid=["']([^"']+)["']/i.exec(attributes);

      // Use existing ID or generate one with duplicate handling
      const id = idMatch
        ? idMatch[1]
        : (() => {
            const baseId = generateHeadingId(text);
            const count = seenIds.get(baseId) ?? 0;
            seenIds.set(baseId, count + 1);
            return count > 0 ? `${baseId}-${count}` : baseId;
          })();

      headings.push({ id, text, level });
    }
    match = regex.exec(content);
  }

  return headings;
}

/**
 * Hook to extract headings from document content
 */
export function useHeadings(
  content: string | null,
  type: DocumentType | null,
): Heading[] {
  return useMemo(() => {
    if (!content || !type) return [];

    if (type === "markdown") {
      return parseMarkdownHeadings(content);
    }

    return parseHtmlHeadings(content);
  }, [content, type]);
}
