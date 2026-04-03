import type { Highlighter } from "./highlight/highlighter";
import { resolveMarginNotePositions } from "./margin-layout";

type Listener = () => void;

export class Positions {
  private relative = new Map<string, number>();
  private absolute = new Map<string, number>();
  private snapshot: Record<string, number> = {};
  private notes = new Map<string, HTMLElement>();
  private ids: string[] = [];
  private pendingTop: number | undefined;
  private listeners = new Set<Listener>();
  private root: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private highlighter: Highlighter | null = null;
  private resizeRaf: number | null = null;
  private cacheRaf: number | null = null;
  private unsubCache: (() => void) | null = null;

  attach(root: HTMLElement, container: HTMLElement, highlighter: Highlighter) {
    this.root = root;
    this.container = container;
    this.highlighter = highlighter;
    window.addEventListener("resize", this.onResize);

    this.unsubCache = highlighter.onCacheInvalidated(() => {
      if (this.cacheRaf !== null) return;
      this.cacheRaf = requestAnimationFrame(() => {
        this.cacheRaf = null;
        this.cache();
      });
    });
  }

  detach() {
    window.removeEventListener("resize", this.onResize);
    if (this.resizeRaf !== null) cancelAnimationFrame(this.resizeRaf);
    if (this.cacheRaf !== null) cancelAnimationFrame(this.cacheRaf);
    this.resizeRaf = null;
    this.cacheRaf = null;
    this.unsubCache?.();
    this.unsubCache = null;
    this.root = null;
    this.container = null;
    this.highlighter = null;
  }

  cache() {
    if (!this.root || !this.container || !this.highlighter) return;

    const highlightedIds = this.highlighter.getHighlightedIds();
    if (highlightedIds.length === 0) return;

    const ref = this.container.getBoundingClientRect();
    const scrollY = window.scrollY;

    this.relative.clear();
    this.absolute.clear();

    const positions = this.highlighter.getPositions(ref);
    for (const [id, relTop] of positions) {
      this.relative.set(id, relTop);
      this.absolute.set(id, relTop + ref.top + scrollY);
    }

    const snap: Record<string, number> = {};
    for (const [id, top] of this.absolute) snap[id] = top;
    this.snapshot = snap;

    this.apply();
    this.notify();
    this.exposeReady();
  }

  setIds(ids: string[]) {
    this.ids = ids;
  }

  setPending(top: number | undefined) {
    if (this.pendingTop === top) return;
    this.pendingTop = top;
    this.apply();
  }

  register(id: string, el: HTMLElement) {
    this.notes.set(id, el);
    const top = this.resolve().get(id);
    if (top !== undefined) {
      el.style.top = `${top}px`;
      el.style.visibility = "visible";
    } else {
      el.style.visibility = "hidden";
    }
  }

  unregister(id: string) {
    this.notes.delete(id);
  }

  getAbsolute(): Record<string, number> {
    return this.snapshot;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispose() {
    this.detach();
    this.relative.clear();
    this.absolute.clear();
    this.snapshot = {};
    this.notes.clear();
    this.listeners.clear();
    this.ids = [];
  }

  private resolve(): Map<string, number> {
    const pos: Record<string, number> = {};
    for (const [id, top] of this.relative) pos[id] = top;
    return resolveMarginNotePositions(this.ids, pos, this.pendingTop);
  }

  private apply() {
    const resolved = this.resolve();
    for (const [id, el] of this.notes) {
      const top = resolved.get(id);
      if (top !== undefined) {
        el.style.top = `${top}px`;
        el.style.visibility = "visible";
      } else {
        el.style.visibility = "hidden";
      }
    }
  }

  private onResize = () => {
    if (this.resizeRaf !== null) return;
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = null;
      this.cache();
    });
  };

  private notify() {
    for (const fn of this.listeners) fn();
  }

  private exposeReady() {
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__readitPositionsReady =
        performance.now();
    }
  }
}
