import type { Comment, CommentFile } from "../../types";
import { serializeComments } from "../comment-storage";

// --- Document fixtures ---

function generateMarkdownDoc(lineCount: number): string {
  const lines: string[] = [];
  lines.push("# Performance Test Document");
  lines.push("");
  lines.push(
    "This is a synthetic document for benchmarking. It contains various formatting patterns typical of real-world documentation.",
  );
  lines.push("");

  let sectionNum = 1;
  while (lines.length < lineCount) {
    lines.push(`## Section ${sectionNum}`);
    lines.push("");
    lines.push(
      `This section covers topic ${sectionNum} in detail. It contains various formatting including **bold**, *italic*, and \`inline code\`.`,
    );
    lines.push("");

    // Add a list
    for (let j = 1; j <= 3; j++) {
      lines.push(`- Item ${j} in section ${sectionNum}`);
    }
    lines.push("");

    // Add a code block
    lines.push("```typescript");
    lines.push(`function section${sectionNum}() {`);
    lines.push(`  const value = ${sectionNum} * 42;`);
    lines.push(`  return "result from section ${sectionNum}: " + value;`);
    lines.push("}");
    lines.push("```");
    lines.push("");

    // Add a paragraph
    lines.push(
      `The conclusion of section ${sectionNum} summarizes the key findings and provides actionable recommendations for the reader to follow.`,
    );
    lines.push("");

    // Add a table every few sections
    if (sectionNum % 3 === 0) {
      lines.push("| Column A | Column B | Column C |");
      lines.push("|----------|----------|----------|");
      lines.push(
        `| Cell ${sectionNum}.1 | Cell ${sectionNum}.2 | Cell ${sectionNum}.3 |`,
      );
      lines.push(
        `| Cell ${sectionNum}.4 | Cell ${sectionNum}.5 | Cell ${sectionNum}.6 |`,
      );
      lines.push("");
    }

    sectionNum++;
  }

  return lines.slice(0, lineCount).join("\n");
}

export const SMALL_DOC = generateMarkdownDoc(30);
export const MEDIUM_DOC = generateMarkdownDoc(150);
export const LARGE_DOC = generateMarkdownDoc(300);

// --- Comment fixtures ---

function makeComment(index: number, doc: string): Comment {
  const lines = doc.split("\n");
  // Distribute comments across the document
  const targetLine = Math.min(
    Math.floor((index + 1) * (lines.length / 55)),
    lines.length - 1,
  );

  const lineText = lines[targetLine];
  const selectedText =
    lineText.length > 10
      ? lineText.slice(0, Math.min(30, lineText.length))
      : lineText || "default text";

  // Calculate actual character offset
  let startOffset = 0;
  for (let i = 0; i < targetLine; i++) {
    startOffset += lines[i].length + 1; // +1 for \n
  }
  const endOffset = startOffset + selectedText.length;

  return {
    id: `bench${String(index).padStart(3, "0")}`,
    selectedText,
    comment: `Benchmark comment ${index}: This text needs to be reviewed and updated.`,
    createdAt: "2025-01-01T00:00:00.000Z",
    startOffset,
    endOffset,
    lineHint: `L${targetLine + 1}`,
  };
}

export function makeComments(count: number): Comment[] {
  return Array.from({ length: count }, (_, i) => makeComment(i, LARGE_DOC));
}

export const COMMENTS_1 = makeComments(1);
export const COMMENTS_10 = makeComments(10);
export const COMMENTS_50 = makeComments(50);

// --- Serialized comment file fixtures ---

function makeCommentFile(comments: Comment[]): CommentFile {
  return {
    source: "/bench/test-doc.md",
    hash: "abcdef1234567890",
    version: 1,
    comments,
  };
}

export const COMMENT_FILE_OBJ_SMALL = makeCommentFile(COMMENTS_1);
export const COMMENT_FILE_OBJ_MEDIUM = makeCommentFile(COMMENTS_10);
export const COMMENT_FILE_OBJ_LARGE = makeCommentFile(COMMENTS_50);

export const COMMENT_FILE_SMALL = serializeComments(COMMENT_FILE_OBJ_SMALL);
export const COMMENT_FILE_MEDIUM = serializeComments(COMMENT_FILE_OBJ_MEDIUM);
export const COMMENT_FILE_LARGE = serializeComments(COMMENT_FILE_OBJ_LARGE);

// --- Highlight position fixtures ---

export function makeHighlightPositions(count: number): Record<string, number> {
  const positions: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    // ~200px spacing with clustering every 3rd note for overlap scenarios
    positions[`c${i}`] = i * 200 + (i % 3 === 0 ? 50 : 0);
  }
  return positions;
}

// --- HTML fixture ---

function generateHtmlDoc(): string {
  const parts: string[] = [
    "<!DOCTYPE html>",
    "<html><head>",
    "<style>.main { color: red; font-size: 16px; }</style>",
    "<script>console.log('test script');</script>",
    "</head><body>",
  ];

  for (let i = 0; i < 30; i++) {
    parts.push(`<section id="s${i}">`);
    parts.push(`<h2>Section ${i}</h2>`);
    parts.push(
      `<p>Paragraph with &amp; entities &lt;and&gt; special &quot;chars&quot; in section ${i}.</p>`,
    );
    parts.push(
      `<ul><li>Item ${i}.1</li><li>Item ${i}.2</li><li>Item ${i}.3</li></ul>`,
    );
    parts.push("</section>");
  }

  parts.push("</body></html>");
  return parts.join("\n");
}

export const HTML_DOC = generateHtmlDoc();
