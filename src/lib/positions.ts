import { findBlockAncestor } from "./clustering";
import type { Highlighter } from "./highlight/highlighter";
import { resolveClusterPositions } from "./margin-layout";

type Listener = () => void;

export interface ClusterShape {
  id: string;
  commentIds: string[];
  entryHeight: number;
  entryCount: number;
}

export interface MarkerAnchor {
  top: number;
  left: number;
}

export class Positions {
  private clusters: ClusterShape[] = [];
  private elements = new Map<string, HTMLElement>();
  private anchorTops = new Map<string, number>();
  private markerAnchors = new Map<string, MarkerAnchor>();
  private resolved = new Map<string, { top: number; height: number }>();
  private pendingTop: number | undefined;
  private listeners = new Set<Listener>();
  private container: HTMLElement | null = null;
  private highlighter: Highlighter | null = null;
  private resizeRaf: number | null = null;
  private cacheRaf: number | null = null;
  private unsubCache: (() => void) | null = null;

  attach(_root: HTMLElement, container: HTMLElement, highlighter: Highlighter) {
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
    this.container = null;
    this.highlighter = null;
  }

  cache() {
    if (!this.container || !this.highlighter) return;

    const ref = this.container.getBoundingClientRect();
    const anchors = this.highlighter.getMarkerAnchors(ref);
    this.markerAnchors = anchors;

    this.anchorTops.clear();
    for (const cluster of this.clusters) {
      const top = this.computeAnchorTop(cluster, ref);
      if (top !== undefined) this.anchorTops.set(cluster.id, top);
    }

    this.apply();
    this.notify();
    this.exposeReady();
  }

  setClusters(clusters: ClusterShape[]) {
    this.clusters = clusters;
  }

  setPending(top: number | undefined) {
    if (this.pendingTop === top) return;
    this.pendingTop = top;
    this.apply();
  }

  registerCluster(id: string, el: HTMLElement) {
    this.elements.set(id, el);
    const pos = this.resolved.get(id);
    if (pos) {
      el.style.top = `${pos.top}px`;
      el.style.visibility = "visible";
    } else {
      el.style.visibility = "hidden";
    }
  }

  unregisterCluster(id: string) {
    this.elements.delete(id);
  }

  getMarkerAnchors(): ReadonlyMap<string, MarkerAnchor> {
    return this.markerAnchors;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  dispose() {
    this.detach();
    this.clusters = [];
    this.elements.clear();
    this.anchorTops.clear();
    this.markerAnchors.clear();
    this.resolved.clear();
    this.listeners.clear();
  }

  private computeAnchorTop(
    cluster: ClusterShape,
    containerRect: DOMRect,
  ): number | undefined {
    if (!this.highlighter) return undefined;

    let paragraph: Element | null = null;
    for (const id of cluster.commentIds) {
      const ranges = this.highlighter.getRanges(id);
      if (ranges.length === 0) continue;
      paragraph = findBlockAncestor(ranges[0].startContainer);
      if (paragraph) break;
    }
    if (!paragraph) return undefined;

    const rect = paragraph.getBoundingClientRect();
    return rect.top - containerRect.top;
  }

  private apply() {
    const inputs = this.clusters
      .filter((c) => this.anchorTops.has(c.id))
      .map((c) => ({
        id: c.id,
        anchorTop: this.anchorTops.get(c.id) ?? 0,
        entryHeight: c.entryHeight,
        entryCount: c.entryCount,
      }));

    this.resolved = resolveClusterPositions(inputs, this.pendingTop);

    for (const [id, el] of this.elements) {
      const pos = this.resolved.get(id);
      if (pos) {
        el.style.top = `${pos.top}px`;
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
