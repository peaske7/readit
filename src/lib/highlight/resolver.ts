import { findTextPosition } from "./core";
import type { HighlightComment, TextPosition } from "./types";

/**
 * Resolves anchors via Web Worker with sync fallback.
 */
export class Resolver {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<
    number,
    (results: Map<string, TextPosition>) => void
  >();

  constructor() {
    try {
      this.worker = new Worker(
        new URL("./worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker.onmessage = this.onMessage;
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  resolve(
    text: string,
    comments: HighlightComment[],
  ): Promise<Map<string, TextPosition>> {
    if (!this.worker || comments.length === 0) {
      return Promise.resolve(this.sync(text, comments));
    }

    return new Promise((resolve) => {
      const id = this.seq++;
      this.pending.set(id, resolve);
      this.worker!.postMessage({
        id,
        textContent: text,
        comments: comments.map((c) => ({
          id: c.id,
          selectedText: c.selectedText,
          startOffset: c.startOffset,
        })),
      });
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const resolve of this.pending.values()) resolve(new Map());
    this.pending.clear();
  }

  private onMessage = (e: MessageEvent) => {
    const { id, results } = e.data;
    const resolve = this.pending.get(id);
    if (!resolve) return;

    this.pending.delete(id);
    const map = new Map<string, TextPosition>();
    for (const r of results) map.set(r.id, { start: r.start, end: r.end });
    resolve(map);
  };

  private sync(
    text: string,
    comments: HighlightComment[],
  ): Map<string, TextPosition> {
    const map = new Map<string, TextPosition>();
    for (const c of comments) {
      const pos = findTextPosition(text, c.selectedText, c.startOffset);
      if (pos) map.set(c.id, pos);
    }
    return map;
  }
}
