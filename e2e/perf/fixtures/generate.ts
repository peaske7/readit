import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// ─── Types ───────────────────────────────────────────────────────────

interface Comment {
  id: string;
  selectedText: string;
  comment: string;
  createdAt: string;
  startOffset: number;
  endOffset: number;
  lineHint: string;
}

interface CommentFile {
  source: string;
  hash: string;
  version: number;
  comments: Comment[];
}

export interface Tier {
  name: string;
  lines: number;
  comments: number;
  fileName: string;
}

export const TIERS: Tier[] = [
  { name: "medium", lines: 1000, comments: 100, fileName: "medium.md" },
  { name: "large", lines: 3000, comments: 200, fileName: "large.md" },
];

// Second medium doc for tab-switch tests
export const TAB_SWITCH_TIER: Tier = {
  name: "medium-b",
  lines: 1000,
  comments: 100,
  fileName: "medium-b.md",
};

export const FIXTURES_DIR = path.join(os.tmpdir(), "readit-perf-fixtures");

// ─── Markdown generation ─────────────────────────────────────────────

function generateMarkdownDoc(lineCount: number, seed: number): string {
  const lines: string[] = [];
  lines.push(`# Performance Benchmark Document (seed=${seed})`);
  lines.push("");
  lines.push(
    "This document is auto-generated for performance benchmarking. It contains realistic markdown patterns.",
  );
  lines.push("");

  let sectionNum = 1;
  while (lines.length < lineCount) {
    lines.push(`## Section ${sectionNum}: Topic Area ${sectionNum}`);
    lines.push("");
    lines.push(
      `This section covers topic ${sectionNum} in detail. It includes various formatting such as **bold text**, *italic text*, and \`inline code\`. The content is designed to exercise the rendering pipeline.`,
    );
    lines.push("");

    // Paragraph
    lines.push(
      `When reviewing documents of this complexity, it is important to consider the performance implications of rendering each element. Section ${sectionNum} demonstrates how the margin notes system handles comments distributed across a long document.`,
    );
    lines.push("");

    // List
    for (let j = 1; j <= 4; j++) {
      lines.push(
        `- Item ${j} in section ${sectionNum}: a list entry with enough text to be selectable`,
      );
    }
    lines.push("");

    // Code block
    lines.push("```typescript");
    lines.push(`function processSection${sectionNum}(data: unknown) {`);
    lines.push(`  const result = validate(data);`);
    lines.push(
      `  if (!result.ok) throw new Error("Section ${sectionNum} failed");`,
    );
    lines.push(`  return transform(result.value);`);
    lines.push("}");
    lines.push("```");
    lines.push("");

    // Another paragraph
    lines.push(
      `The conclusion of section ${sectionNum} summarizes the key findings and provides actionable recommendations for the reader. This paragraph exists to ensure sufficient text density for highlight testing.`,
    );
    lines.push("");

    // Table every 4th section
    if (sectionNum % 4 === 0) {
      lines.push("| Metric | Before | After | Change |");
      lines.push("|--------|--------|-------|--------|");
      lines.push(
        `| Latency | ${sectionNum * 10}ms | ${sectionNum * 5}ms | -50% |`,
      );
      lines.push(
        `| Throughput | ${sectionNum * 100} | ${sectionNum * 200} | +100% |`,
      );
      lines.push("");
    }

    // Blockquote every 5th section
    if (sectionNum % 5 === 0) {
      lines.push(
        `> Note: Section ${sectionNum} contains important observations about system behavior under load.`,
      );
      lines.push("");
    }

    sectionNum++;
  }

  return lines.slice(0, lineCount).join("\n");
}

// ─── Comment generation ──────────────────────────────────────────────

function makeComment(
  index: number,
  doc: string,
  totalComments: number,
): Comment {
  const lines = doc.split("\n");

  // Distribute comments evenly across the document, skipping empty lines and headers
  const contentLines: { lineIndex: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.length > 20 &&
      !line.startsWith("#") &&
      !line.startsWith("```") &&
      !line.startsWith("|") &&
      !line.startsWith(">") &&
      !line.startsWith("- ")
    ) {
      contentLines.push({ lineIndex: i, text: line });
    }
  }

  // Pick a content line for this comment
  const targetIdx = Math.floor(
    (index / totalComments) * (contentLines.length - 1),
  );
  const target = contentLines[Math.min(targetIdx, contentLines.length - 1)];

  // Select a substring from the target line
  const selectStart = 0;
  const selectEnd = Math.min(40, target.text.length);
  const selectedText = target.text.slice(selectStart, selectEnd);

  // Compute character offset in the full document
  let startOffset = 0;
  for (let i = 0; i < target.lineIndex; i++) {
    startOffset += lines[i].length + 1; // +1 for \n
  }
  startOffset += selectStart;
  const endOffset = startOffset + selectedText.length;

  // Line hint (1-indexed)
  const lineHint = `L${target.lineIndex + 1}`;

  return {
    id: `perf${String(index).padStart(4, "0")}`,
    selectedText,
    comment: `Review comment #${index + 1}: This section needs attention regarding clarity and accuracy.`,
    createdAt: "2025-01-01T00:00:00.000Z",
    startOffset,
    endOffset,
    lineHint,
  };
}

// ─── Comment serialization (standalone, no imports from src/) ────────

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function serializeComments(file: CommentFile): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`source: ${file.source}`);
  lines.push(`hash: ${file.hash}`);
  lines.push(`version: ${file.version}`);
  lines.push("---");
  lines.push("");

  for (const comment of file.comments) {
    // Metadata
    lines.push(
      `<!-- c:${comment.id}|${comment.lineHint}|${comment.createdAt} -->`,
    );

    // Selected text as blockquote
    const quotedLines = comment.selectedText
      .split("\n")
      .map((line) => `> ${line}`);
    lines.push(...quotedLines);

    // Comment body
    if (comment.comment) {
      lines.push("");
      lines.push(comment.comment);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Compute comment path using realpath to match the server's path resolution.
 * The server uses fs.realpath() which resolves symlinks (e.g., /var → /private/var on macOS).
 * The sourcePath must exist on disk before calling this.
 */
async function getCommentPathReal(sourcePath: string): Promise<string> {
  const real = await fs.realpath(path.resolve(sourcePath));
  const normalized = real.replace(/^\//, "").replace(/^[A-Z]:[\\/]/, "");
  const ext = path.extname(normalized);
  const withoutExt = normalized.slice(0, -ext.length || undefined);
  return path.join(
    os.homedir(),
    ".readit",
    "comments",
    `${withoutExt}.comments.md`,
  );
}

/** Sync version for cleanup (file may not exist) */
function getCommentPathSync(sourcePath: string): string {
  let absolute: string;
  try {
    absolute = require("node:fs").realpathSync(path.resolve(sourcePath));
  } catch {
    absolute = path.resolve(sourcePath);
  }
  const normalized = absolute.replace(/^\//, "").replace(/^[A-Z]:[\\/]/, "");
  const ext = path.extname(normalized);
  const withoutExt = normalized.slice(0, -ext.length || undefined);
  return path.join(
    os.homedir(),
    ".readit",
    "comments",
    `${withoutExt}.comments.md`,
  );
}

// ─── Public API ──────────────────────────────────────────────────────

export function getFixturePath(tier: Tier): string {
  return path.join(FIXTURES_DIR, tier.fileName);
}

export async function generateFixtures(): Promise<void> {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });

  const allTiers = [...TIERS, TAB_SWITCH_TIER];

  for (const tier of allTiers) {
    const doc = generateMarkdownDoc(tier.lines, tier.lines);
    const fixturePath = getFixturePath(tier);
    await fs.writeFile(fixturePath, doc, "utf-8");

    // Generate and write comment file
    const comments: Comment[] = [];
    for (let i = 0; i < tier.comments; i++) {
      comments.push(makeComment(i, doc, tier.comments));
    }

    // Use realpath for the comment path (file must exist first)
    const realFixturePath = await fs.realpath(fixturePath);

    const commentFile: CommentFile = {
      source: realFixturePath,
      hash: computeHash(doc),
      version: 1,
      comments,
    };

    const commentPath = await getCommentPathReal(fixturePath);
    await fs.mkdir(path.dirname(commentPath), { recursive: true });
    await fs.writeFile(commentPath, serializeComments(commentFile), "utf-8");
  }
}

export async function cleanupFixtures(): Promise<void> {
  // Collect comment paths before removing fixtures (need realpath while files exist)
  const commentPaths: string[] = [];
  const allTiers = [...TIERS, TAB_SWITCH_TIER];
  for (const tier of allTiers) {
    commentPaths.push(getCommentPathSync(getFixturePath(tier)));
  }

  // Remove fixture files
  try {
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if already removed
  }

  // Remove comment files
  for (const commentPath of commentPaths) {
    try {
      await fs.unlink(commentPath);
    } catch {
      // Ignore if already removed
    }
  }
}

// Allow running directly: bun e2e/perf/fixtures/generate.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  generateFixtures().then(() => {
    console.log(`Fixtures generated in ${FIXTURES_DIR}`);
  });
}
