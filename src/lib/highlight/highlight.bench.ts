import { bench, describe } from "vitest";
import {
  COMMENTS_10,
  COMMENTS_50,
  LARGE_DOC,
  MEDIUM_DOC,
} from "../__fixtures__/bench-data";
import {
  collectTextNodes,
  collectTextNodesWithContent,
  createRangesFromNodes,
} from "./dom";
import { findTextPosition } from "./resolver";

describe("findTextPosition", () => {
  const textContent = LARGE_DOC;

  bench("single comment", () => {
    const c = COMMENTS_10[5];
    findTextPosition(textContent, c.selectedText, c.startOffset);
  });

  bench("10 comments", () => {
    for (const c of COMMENTS_10) {
      findTextPosition(textContent, c.selectedText, c.startOffset);
    }
  });

  bench("50 comments", () => {
    for (const c of COMMENTS_50) {
      findTextPosition(textContent, c.selectedText, c.startOffset);
    }
  });
});

function buildDocument(markdown: string): HTMLElement {
  const root = document.createElement("article");
  const paragraphs = markdown.split("\n\n");
  for (const p of paragraphs) {
    if (!p.trim()) continue;
    const el = p.startsWith("#")
      ? document.createElement("h2")
      : document.createElement("p");
    el.textContent = p.replace(/^#+\s*/, "");
    root.appendChild(el);
  }
  return root;
}

describe("collectTextNodes", () => {
  const mediumRoot = buildDocument(MEDIUM_DOC);
  const largeRoot = buildDocument(LARGE_DOC);

  bench("medium doc (150 lines)", () => {
    collectTextNodes(mediumRoot);
  });

  bench("large doc (300 lines)", () => {
    collectTextNodes(largeRoot);
  });
});

describe("collectTextNodesWithContent (single-pass)", () => {
  const mediumRoot = buildDocument(MEDIUM_DOC);
  const largeRoot = buildDocument(LARGE_DOC);

  bench("medium doc (150 lines)", () => {
    collectTextNodesWithContent(mediumRoot);
  });

  bench("large doc (300 lines)", () => {
    collectTextNodesWithContent(largeRoot);
  });
});

describe("createRangesFromNodes", () => {
  bench("10 highlights on medium doc", () => {
    const nodes = collectTextNodes(buildDocument(MEDIUM_DOC));
    for (const c of COMMENTS_10) {
      const pos = findTextPosition(MEDIUM_DOC, c.selectedText, c.startOffset);
      if (pos) createRangesFromNodes(nodes, pos.start, pos.end);
    }
  });

  bench("50 highlights on large doc", () => {
    const nodes = collectTextNodes(buildDocument(LARGE_DOC));
    for (const c of COMMENTS_50) {
      const pos = findTextPosition(LARGE_DOC, c.selectedText, c.startOffset);
      if (pos) createRangesFromNodes(nodes, pos.start, pos.end);
    }
  });
});
