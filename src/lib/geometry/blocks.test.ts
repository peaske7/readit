import { describe, expect, it } from "vitest";
import { findBlockAncestor, getDOMTextContent } from "../highlight/dom";
import { extractTextFromHtml } from "../html-text";

/**
 * The third text model: segment by the block ancestor cluster anchoring uses.
 * Written out longhand rather than reusing the walker in `dom.ts` so the two
 * DOM models are compared, not assumed equal.
 */
function blockAncestorText(root: Element): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = "";
  let previous: Element | null = null;

  let node = walker.nextNode();
  while (node) {
    const block = findBlockAncestor(node);
    if (
      previous &&
      block &&
      previous !== block &&
      !previous.contains(block) &&
      !block.contains(previous)
    ) {
      text += "\n";
    }
    text += node.textContent ?? "";
    previous = block;
    node = walker.nextNode();
  }

  return text;
}

function article(html: string): HTMLElement {
  const el = document.createElement("article");
  el.innerHTML = html; // eslint-disable-line -- test fixture
  return el;
}

/**
 * Shaped like the server's markdown output: headings, inline markup, a shiki
 * code block, a table, a blockquote and a nested list. Kept as literal HTML so
 * the conformance check doesn't depend on the renderer.
 */
const FIXTURE = [
  '<h1 id="title">Performance Test Document</h1>',
  "<p>Topic 1 with <strong>bold</strong>, <em>italic</em> and <code>inline</code>.</p>",
  "<h2>Section 2</h2>",
  "<ul>",
  "<li>Item 1</li>",
  "<li>Item 2<ul><li>Nested item</li></ul></li>",
  "</ul>",
  '<pre class="shiki"><code>',
  '<span class="line"><span>function section2() {</span></span>\n',
  '<span class="line"><span>  return "result";</span></span>\n',
  '<span class="line"><span>}</span></span>',
  "</code></pre>",
  "<table><thead><tr><th>Column A</th><th>Column B</th></tr></thead>",
  "<tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table>",
  "<blockquote><p>A blockquote with some text.</p></blockquote>",
  '<div class="wrapper"><p>Wrapped paragraph.</p></div>',
  "<p>Final paragraph.</p>",
].join("");

describe("block segmentation conformance", () => {
  it("walks one fixture identically in all three text models", () => {
    const serverText = extractTextFromHtml(FIXTURE);
    expect(getDOMTextContent(article(FIXTURE))).toBe(serverText);
    expect(blockAncestorText(article(FIXTURE))).toBe(serverText);
  });

  it("segments adjacent, nested and table blocks the way the models expect", () => {
    const html =
      "<blockquote><p>Quoted</p></blockquote>" +
      "<ul><li>One</li><li>Two</li></ul>" +
      "<p>Text with <strong>bold</strong> inside</p>" +
      "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>";

    const serverText = extractTextFromHtml(html);
    // A table row is one block, so cells within a row do not add a newline.
    expect(serverText).toBe("Quoted\nOne\nTwo\nText with bold inside\nab\nc");
    expect(getDOMTextContent(article(html))).toBe(serverText);
    expect(blockAncestorText(article(html))).toBe(serverText);
  });
});
