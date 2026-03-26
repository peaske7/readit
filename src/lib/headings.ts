export interface Heading {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function stripCodeBlocks(content: string): string {
  let result = content.replace(/^(`{3,}|~{3,}).*$[\s\S]*?^\1\s*$/gm, "");
  result = result.replace(/(?:^|\n\n)((?:(?:[ ]{4}|\t).+\n?)+)/g, "\n\n");

  return result;
}

export function parseMarkdownHeadings(content: string): Heading[] {
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
