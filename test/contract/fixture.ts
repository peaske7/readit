/**
 * One document, used by every adapter. The Worker stores a snapshot rather
 * than a file, so the rendered HTML lives here next to the Markdown and the
 * two are kept in sync by hand: anchor resolution matches `selectedText`
 * against the source first and the DOM text second, so both must contain the
 * selected phrases verbatim.
 */
export const FIXTURE_MARKDOWN = `# Contract fixture

The quick brown fox jumps over the lazy dog.

## Anchors

Comments anchor to this paragraph by its text.
`;

export const FIXTURE_HTML = `<h1 id="contract-fixture">Contract fixture</h1>
<p>The quick brown fox jumps over the lazy dog.</p>
<h2 id="anchors">Anchors</h2>
<p>Comments anchor to this paragraph by its text.</p>`;

export const FIXTURE_HEADINGS = [
  { id: "contract-fixture", text: "Contract fixture", level: 1 },
  { id: "anchors", text: "Anchors", level: 2 },
];

/** A second document, so `POST /api/documents` has something to open. */
export const SECOND_MARKDOWN = `# Second fixture

Another document the server can be asked to open.
`;

export const SELECTED_TEXT = "quick brown fox";
export const REANCHORED_TEXT = "lazy dog";

/**
 * Offsets are a starting point only: every server re-resolves them from the
 * stored `selectedText` when it reads comments back.
 */
export function selectionOf(text: string): {
  selectedText: string;
  startOffset: number;
  endOffset: number;
} {
  const startOffset = FIXTURE_MARKDOWN.indexOf(text);
  if (startOffset === -1) {
    throw new Error(`Fixture does not contain "${text}"`);
  }
  return {
    selectedText: text,
    startOffset,
    endOffset: startOffset + text.length,
  };
}
