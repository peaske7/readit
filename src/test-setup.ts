import "@testing-library/jest-dom/vitest";

// Mock CSS Custom Highlight API for jsdom (not supported natively)
if (typeof globalThis.Highlight === "undefined") {
  globalThis.Highlight = class Highlight {
    _ranges: AbstractRange[];
    priority = 0;
    type: "highlight" | "spelling-error" | "grammar-error" = "highlight";
    get size() {
      return this._ranges.length;
    }
    constructor(...ranges: AbstractRange[]) {
      this._ranges = ranges;
    }
    add(range: AbstractRange) {
      this._ranges.push(range);
    }
    delete(range: AbstractRange) {
      const idx = this._ranges.indexOf(range);
      if (idx >= 0) {
        this._ranges.splice(idx, 1);
        return true;
      }
      return false;
    }
    clear() {
      this._ranges = [];
    }
    has(range: AbstractRange) {
      return this._ranges.includes(range);
    }
    [Symbol.iterator]() {
      return this._ranges[Symbol.iterator]();
    }
  } as unknown as typeof Highlight;
}

if (typeof CSS === "undefined" || !CSS.highlights) {
  const highlightsMap = new Map<string, Highlight>();
  Object.defineProperty(globalThis, "CSS", {
    value: {
      ...((globalThis as Record<string, unknown>).CSS ?? {}),
      highlights: highlightsMap,
    },
    writable: true,
    configurable: true,
  });
}
