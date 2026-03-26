import { resolveMarginNotePositions } from "./margin-layout";

type Listener = () => void;

/**
 * Positions managed outside React. Scroll-invariant — only recalculates
 * on highlight mutation (MutationObserver) and resize.
 */
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
  private resizeRaf: number | null = null;
  private mutationRaf: number | null = null;
  private observer: MutationObserver | null = null;

  attach(root: HTMLElement, container: HTMLElement) {
    this.root = root;
    this.container = container;
    window.addEventListener("resize", this.onResize);

    this.observer = new MutationObserver(() => {
      if (this.mutationRaf !== null) return;
      this.mutationRaf = requestAnimationFrame(() => {
        this.mutationRaf = null;
        this.cache();
      });
    });
    this.observer.observe(root, { childList: true, subtree: true });
  }

  detach() {
    window.removeEventListener("resize", this.onResize);
    if (this.resizeRaf !== null) cancelAnimationFrame(this.resizeRaf);
    if (this.mutationRaf !== null) cancelAnimationFrame(this.mutationRaf);
    this.resizeRaf = null;
    this.mutationRaf = null;
    this.observer?.disconnect();
    this.observer = null;
    this.root = null;
    this.container = null;
  }

  cache() {
    if (!this.root || !this.container) return;

    const ref = this.container.getBoundingClientRect();
    const scrollY = window.scrollY;

    this.relative.clear();
    this.absolute.clear();

    for (const mark of this.root.querySelectorAll("mark[data-comment-id]")) {
      const id = mark.getAttribute("data-comment-id");
      if (!id || this.relative.has(id)) continue;

      const rect = mark.getBoundingClientRect();
      this.relative.set(id, rect.top - ref.top);
      this.absolute.set(id, rect.top + scrollY);
    }

    const snap: Record<string, number> = {};
    for (const [id, top] of this.absolute) snap[id] = top;
    this.snapshot = snap;

    this.apply();
    this.notify();
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
}
