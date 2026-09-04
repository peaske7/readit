import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createHighlighter, type Highlighter } from "./highlighter";

// jsdom implements the Selection API but never fires `selectionchange` or
// lays anything out, so the tests dispatch the events themselves and let
// every rect come back as zeros.

const ZERO_RECT = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
  width: 0,
  height: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => ZERO_RECT;
});

let root: HTMLElement;
let container: HTMLElement;
let highlighter: Highlighter;
let selections: Array<{ text: string; start: number; end: number }>;

function selectWord(word: string) {
  const textNode = root.firstChild?.firstChild as Text;
  const index = textNode.data.indexOf(word);
  const range = document.createRange();
  range.setStart(textNode, index);
  range.setEnd(textNode, index + word.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

function collapseSelection() {
  window.getSelection()?.removeAllRanges();
  document.dispatchEvent(new Event("selectionchange"));
}

function pointer(type: "pointerdown" | "pointerup", pointerType: string) {
  document.dispatchEvent(Object.assign(new Event(type), { pointerType }));
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  root = document.createElement("article");
  root.innerHTML = "<p>alpha beta gamma</p>"; // eslint-disable-line -- fixture
  container.appendChild(root);
  document.body.appendChild(container);
  selections = [];
  highlighter = createHighlighter({
    root,
    container,
    onSelect: (text, start, end) => selections.push({ text, start, end }),
  });
});

afterEach(() => {
  highlighter.dispose();
  container.remove();
  window.getSelection()?.removeAllRanges();
  vi.useRealTimers();
});

describe("touch selection via selectionchange", () => {
  it("emits once the selection settles, without any mouseup", () => {
    selectWord("beta");
    expect(selections).toEqual([]);

    vi.advanceTimersByTime(300);
    expect(selections).toEqual([{ text: "beta", start: 6, end: 10 }]);
  });

  it("restarts the settle timer while the handles keep moving", () => {
    selectWord("beta");
    vi.advanceTimersByTime(200);
    selectWord("beta gamma");
    vi.advanceTimersByTime(200);
    expect(selections).toEqual([]);

    vi.advanceTimersByTime(100);
    expect(selections).toEqual([{ text: "beta gamma", start: 6, end: 16 }]);
  });

  it("does not re-emit an unchanged range after a mouseup already did", () => {
    selectWord("alpha");
    root.dispatchEvent(new Event("mouseup"));
    expect(selections).toHaveLength(1);

    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(300);
    expect(selections).toHaveLength(1);
  });

  it("emits the same range again after the selection collapsed in between", () => {
    selectWord("alpha");
    vi.advanceTimersByTime(300);
    collapseSelection();
    selectWord("alpha");
    vi.advanceTimersByTime(300);
    expect(selections).toHaveLength(2);
  });

  it("waits for the mouse button before treating a drag as finished", () => {
    pointer("pointerdown", "mouse");
    selectWord("gamma");
    vi.advanceTimersByTime(300);
    expect(selections).toEqual([]);

    pointer("pointerup", "mouse");
    root.dispatchEvent(new Event("mouseup"));
    expect(selections).toEqual([{ text: "gamma", start: 11, end: 16 }]);
  });

  it("ignores a held touch pointer, which never blocks a selection", () => {
    pointer("pointerdown", "touch");
    selectWord("gamma");
    vi.advanceTimersByTime(300);
    expect(selections).toHaveLength(1);
  });

  it("ignores selections outside the document root", () => {
    const outside = document.createElement("p");
    outside.textContent = "elsewhere";
    document.body.appendChild(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    window.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    vi.advanceTimersByTime(300);
    expect(selections).toEqual([]);
    outside.remove();
  });

  it("stops listening after dispose", () => {
    highlighter.dispose();
    selectWord("alpha");
    vi.advanceTimersByTime(300);
    expect(selections).toEqual([]);
    highlighter = createHighlighter({ root, container, onSelect: () => {} });
  });
});
