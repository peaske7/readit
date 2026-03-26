import { useMemo } from "react";
import { slugify } from "../lib/utils";

export interface Heading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

function stripCodeBlocks(content: string): string {
  let result = content.replace(/^(`{3,}|~{3,}).*$[\s\S]*?^\1\s*$/gm, "");
  // Only remove indented blocks preceded by a blank line (avoids removing list items)
  result = result.replace(/(?:^|\n\n)((?:(?:[ ]{4}|\t).+\n?)+)/g, "\n\n");

  return result;
}

function parseMarkdownHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const seenIds = new Map<string, number>();
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

export function useHeadings(content: string | null): Heading[] {
  return useMemo(() => {
    if (!content) return [];
    return parseMarkdownHeadings(content);
  }, [content]);
}
