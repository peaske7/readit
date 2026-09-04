/**
 * The one definition of "block" shared by every text model: the regex walk in
 * `html-text.ts` (also imported server-side), the DOM TreeWalker in
 * `highlight/dom.ts`, and cluster anchoring in `clustering.ts`. All three must
 * segment a document identically — a comment's offsets are produced by one
 * model and consumed by the others, so a disagreement silently shifts
 * highlights. `blocks.test.ts` walks one fixture with all three.
 *
 * Deliberately free of DOM globals so non-browser callers can import it.
 *
 * Two omissions worth naming:
 * - Void elements (`br`, `hr`, …) never wrap text, so they can never be a
 *   block ancestor and listing them would change nothing.
 * - `td`/`th` are absent: a table row is one block, and splitting it per cell
 *   would insert newlines the other models do not produce.
 */
const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "PRE",
  "BLOCKQUOTE",
  "LI",
  "TR",
]);

export function isBlockTag(tagName: string): boolean {
  return BLOCK_TAGS.has(tagName.toUpperCase());
}
