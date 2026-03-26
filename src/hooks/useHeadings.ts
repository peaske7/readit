import { useMemo } from "react";
import { slugify } from "../lib/utils";

export interface Heading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * Remove code blocks from markdown content.
 * Handles both fenced (```) and indented (4 spaces) code blocks.
 */
function stripCodeBlocks(content: string): string {
  // Remove fenced code blocks (``` or ~~~)
  let result = content.replace(/^(`{3,}|~{3,}).*$[\s\S]*?^\1\s*$/gm, "");

  // Remove indented code blocks (4 spaces or 1 tab at start of line)
  // Only remove if preceded by a blank line (to avoid removing list items)
  result = result.replace(/(?:^|\n\n)((?:(?:[ ]{4}|\t).+\n?)+)/g, "\n\n");

  return result;
}

/**
 * Extract headings from markdown content
 */
function parseMarkdownHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const seenIds = new Map<string, number>();

  // Strip code blocks to avoid matching # comments in code
  const contentWithoutCode = stripCodeBlocks(content);

  const regex = /^(#{1,6})\s+(.+)$/gm;
  let match = regex.exec(contentWithoutCode);

  while (match !== null) {
    const level = match[1].length as 1 | 2 | 3 | 4 | 5 | 6;
    const text = match[2].trim();
    const baseId = slugify(text);
    const count = seenIds.get(baseId) ?? 0;
    const id = count > 0 ? `${baseId}-${count}` : baseId;
    seenIds.set(baseId, count + 1);

    headings.push({ id, text, level });
    match = regex.exec(contentWithoutCode);
  }

  return headings;
}

/**
 * Hook to extract headings from markdown content
 */
export function useHeadings(content: string | null): Heading[] {
  return useMemo(() => {
    if (!content) return [];
    return parseMarkdownHeadings(content);
  }, [content]);
}
