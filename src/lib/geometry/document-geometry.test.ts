import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Comment } from "../../schema";
import { DocumentGeometry } from "./document-geometry";

// jsdom has no layout, so every rect comes from a `data-top` attribute on the
// block element. That is exactly the input the geometry reads.
function rectOf(el: Element | null): DOMRect {
  const top = Number((el as HTMLElement | null)?.dataset?.top ?? 0);
  return {
    top,
    bottom: top + 20,
    left: 0,
    right: 100,
    width: 100,
    height: 20,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return rectOf(this);
  };
  Range.prototype.getClientRects = function () {
    return [
      rectOf(this.startContainer.parentElement),
    ] as unknown as DOMRectList;
  };
});

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function comment(id: string, text: string, start: number): Comment {
  return {
    id,
    selectedText: text,
    comment: `note ${id}`,
    startOffset: start,
    endOffset: start + text.length,
  };
}

const TWO_PARAGRAPHS =
  '<p data-top="100">Alpha one</p><p data-top="300">Beta two</p>';
// "Alpha one\nBeta two" — the block join costs one character.
const ALPHA = comment("a", "Alpha", 0);
const BETA = comment("b", "Beta", 10);

let geometry: DocumentGeometry;

function setup(html: string) {
  const container = document.createElement("div");
  const root = document.createElement("article");
  root.innerHTML = html; // eslint-disable-line -- test fixture
  container.appendChild(root);
  document.body.appendChild(container);

  geometry = new DocumentGeometry();
  geometry.attach({ root, container, html, onSelect: () => {} });
  geometry.setActive(true);
  return { root, container };
}

/** The cluster element the margin column would render, registered as it does. */
function registerCluster(id: string): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  geometry.registerCluster(id, el);
  return el;
}

function paintedRanges(): Range[] {
  const highlight = CSS.highlights.get("comment-color-0");
  return highlight ? [...(highlight as unknown as Iterable<Range>)] : [];
}

afterEach(() => {
  geometry.dispose();
  document.body.innerHTML = "";
});

describe("DocumentGeometry", () => {
  it("clusters applied comments by block and positions them", async () => {
    const { root } = setup(TWO_PARAGRAPHS);
    geometry.setComments([ALPHA, BETA]);
    await frame();

    const { clusters, commentIds, indexById } = geometry.snapshot();
    expect(clusters.map((c) => c.comments.map((cm) => cm.id))).toEqual([
      ["a"],
      ["b"],
    ]);
    expect(commentIds).toEqual(["a", "b"]);
    expect(indexById.get("b")).toBe(1);

    for (const range of paintedRanges()) {
      expect(root.contains(range.startContainer)).toBe(true);
    }

    const el = registerCluster(clusters[1].id);
    geometry.remeasure();
    await frame();
    expect(el.style.top).toBe("300px");
    expect(el.style.visibility).toBe("visible");
  });

  it("groups comments sharing a block into one cluster", async () => {
    setup(TWO_PARAGRAPHS);
    geometry.setComments([ALPHA, comment("a2", "one", 6)]);
    await frame();

    const { clusters } = geometry.snapshot();
    expect(clusters).toHaveLength(1);
    expect(clusters[0].comments.map((c) => c.id)).toEqual(["a", "a2"]);
  });

  it("exposes marker anchors for the body markers", async () => {
    setup(TWO_PARAGRAPHS);
    geometry.setComments([ALPHA, BETA]);
    await frame();

    expect(geometry.snapshot().markerAnchors.get("b")).toEqual({
      top: 300,
      left: 100,
    });
  });

  it("repaints highlights and recomputes positions when the document is replaced", async () => {
    const { root } = setup(TWO_PARAGRAPHS);
    geometry.setComments([ALPHA]);
    await frame();

    const el = registerCluster(geometry.snapshot().clusters[0].id);
    expect(el.style.top).toBe("100px");
    const before = paintedRanges()[0];

    const replaced = geometry.setDocumentHtml(
      '<p data-top="500">Alpha one</p><p data-top="700">Beta two</p>',
    );
    expect(replaced).toBe(true);
    await frame();

    const after = paintedRanges();
    expect(after).toHaveLength(1);
    expect(after[0]).not.toBe(before);
    expect(root.contains(after[0].startContainer)).toBe(true);

    const clusters = geometry.snapshot().clusters;
    expect(clusters).toHaveLength(1);
    registerCluster(clusters[0].id);
    geometry.remeasure();
    await frame();
    expect(el.style.top).toBe("500px");
  });

  it("ignores an unchanged document", () => {
    setup(TWO_PARAGRAPHS);
    expect(geometry.setDocumentHtml(TWO_PARAGRAPHS)).toBe(false);
  });

  it("moves a cluster when a comment is reanchored", async () => {
    setup(TWO_PARAGRAPHS);
    geometry.setComments([ALPHA]);
    await frame();

    const el = registerCluster(geometry.snapshot().clusters[0].id);
    expect(el.style.top).toBe("100px");

    // Same comment, new offsets — what `readit`'s reanchor flow produces.
    geometry.setComments([
      { ...ALPHA, selectedText: "Beta", startOffset: 10, endOffset: 14 },
    ]);
    await frame();

    registerCluster(geometry.snapshot().clusters[0].id);
    geometry.remeasure();
    await frame();
    expect(el.style.top).toBe("300px");
  });

  it("pushes clusters below the pending comment input", async () => {
    setup(TWO_PARAGRAPHS);
    geometry.setComments([ALPHA, BETA]);
    await frame();

    const first = registerCluster(geometry.snapshot().clusters[0].id);
    geometry.remeasure();
    await frame();
    expect(first.style.top).toBe("100px");

    geometry.setPendingSelection(90);
    expect(first.style.top).toBe("250px");
  });

  it("stops painting and measuring once inactive", async () => {
    setup(TWO_PARAGRAPHS);
    geometry.setComments([ALPHA]);
    await frame();
    expect(paintedRanges()).toHaveLength(1);

    geometry.setActive(false);
    geometry.setComments([ALPHA, BETA]);
    await frame();
    expect(geometry.snapshot().commentIds).toEqual(["a"]);
  });
});
