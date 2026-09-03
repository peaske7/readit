import { AnchorConfidences, type Comment } from "../../schema";
import { findBlockAncestor } from "../highlight/dom";
import {
  type ClickHandler,
  createHighlighter,
  type Highlighter,
  type SelectionHandler,
} from "../highlight/highlighter";
import { buildClusters, type Cluster, TierTypes } from "./clustering";
import { COLUMN_BOTTOM_PADDING_PX } from "./constants";
import { type ClusterPosition, resolveClusterPositions } from "./layout";

export interface MarkerAnchor {
  top: number;
  left: number;
}

/** Everything the UI needs to draw the margin column and the body markers. */
export interface GeometrySnapshot {
  clusters: Cluster[];
  /** Comment ids in document order — the numbering the UI shows. */
  commentIds: string[];
  indexById: Map<string, number>;
  markerAnchors: Map<string, MarkerAnchor>;
}

export interface AttachOptions {
  /** The article element holding the document HTML. */
  root: HTMLElement;
  /** The positioned wrapper every measurement is relative to. */
  container: HTMLElement;
  /** HTML already rendered into `root`, so the first paint isn't a re-render. */
  html: string;
  onSelect: SelectionHandler;
  onHighlightClick?: ClickHandler;
}

const EMPTY_SNAPSHOT: GeometrySnapshot = {
  clusters: [],
  commentIds: [],
  indexById: new Map(),
  markerAnchors: new Map(),
};

type Listener = (snapshot: GeometrySnapshot) => void;

/**
 * Answers "where is this comment on screen" for one document.
 *
 * Callers hand it a container and the resolved comments; it paints the
 * highlights, groups them into clusters, resolves the margin-column layout and
 * publishes the result through `snapshot()` / `subscribe()`. The text walk
 * (`highlight/`), clustering and layout are private seams with their own unit
 * tests; the rAF sequencing and repaint-on-change rules live here so they can
 * be tested in jsdom rather than only in the browser.
 */
export class DocumentGeometry {
  private root: HTMLElement | null = null;
  private container: HTMLElement | null = null;
  private highlighter: Highlighter | null = null;
  private unsubscribeCache: (() => void) | null = null;

  private html = "";
  private active = false;
  private comments: Comment[] = [];
  private current: GeometrySnapshot = EMPTY_SNAPSHOT;
  private clustersStale = true;

  private elements = new Map<string, HTMLElement>();
  private anchorTops = new Map<string, number>();
  private resolved = new Map<string, ClusterPosition>();
  private pendingTop: number | undefined;

  private listeners = new Set<Listener>();
  private frame: number | null = null;

  attach(options: AttachOptions) {
    this.detach();
    this.root = options.root;
    this.container = options.container;
    this.html = options.html;

    const highlighter = createHighlighter({
      root: options.root,
      container: options.container,
      onSelect: options.onSelect,
    });
    this.highlighter = highlighter;
    if (options.onHighlightClick) {
      highlighter.onHighlightClick(options.onHighlightClick);
    }
    this.unsubscribeCache = highlighter.onCacheInvalidated(() =>
      this.scheduleMeasure(),
    );
    window.addEventListener("resize", this.onResize);
  }

  detach() {
    window.removeEventListener("resize", this.onResize);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.unsubscribeCache?.();
    this.unsubscribeCache = null;
    this.highlighter?.dispose();
    this.highlighter = null;
    if (this.container) this.container.style.minHeight = "";
    this.root = null;
    this.container = null;
    this.active = false;
  }

  /**
   * Only the visible document is painted and measured — highlights live in the
   * global `CSS.highlights` registry, so a hidden document would fight the
   * visible one over it.
   */
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) return;
    this.highlighter?.clearHighlights();
    this.paint();
  }

  /** Returns whether the document actually changed. */
  setDocumentHtml(html: string): boolean {
    if (html === this.html) return false;
    this.html = html;
    if (this.root) {
      this.root.innerHTML = html; // eslint-disable-line -- trusted server content
    }
    // Every text node is new, so every painted range now points at detached
    // nodes — even when the text itself is unchanged and the highlighter's own
    // change detection would see nothing to do.
    this.highlighter?.clearHighlights();
    this.clustersStale = true;
    this.paint();
    return true;
  }

  setComments(comments: Comment[]) {
    this.comments = comments
      .filter((c) => c.anchorConfidence !== AnchorConfidences.UNRESOLVED)
      .sort((a, b) => a.startOffset - b.startOffset);
    this.clustersStale = true;
    this.paint();
  }

  /** Top of the in-progress selection, so clusters can make room for the input. */
  setPendingSelection(top: number | undefined) {
    if (this.pendingTop === top) return;
    this.pendingTop = top;
    this.applyPositions();
  }

  /** Something outside the text model moved (mermaid render, table resize). */
  remeasure() {
    this.scheduleMeasure();
  }

  registerCluster(id: string, el: HTMLElement) {
    this.elements.set(id, el);
    this.applyClusterStyle(id, el);
  }

  unregisterCluster(id: string) {
    this.elements.delete(id);
  }

  snapshot(): GeometrySnapshot {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  focus(commentId: string | undefined) {
    this.highlighter?.setFocused(commentId);
  }

  scrollTo(commentId: string) {
    this.highlighter?.scrollToComment(commentId);
  }

  dispose() {
    this.detach();
    this.comments = [];
    this.current = EMPTY_SNAPSHOT;
    this.elements.clear();
    this.anchorTops.clear();
    this.resolved.clear();
    this.listeners.clear();
  }

  private paint() {
    if (!this.active || !this.highlighter) return;

    if (this.comments.length === 0) {
      this.highlighter.clearHighlights();
    } else {
      this.highlighter.applyHighlights(
        this.comments.map((c) => ({
          id: c.id,
          selectedText: c.selectedText,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
        })),
      );
    }
    this.scheduleMeasure();
  }

  private scheduleMeasure() {
    if (!this.active || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.measure();
    });
  }

  private measure() {
    const { root, container, highlighter } = this;
    // A frame scheduled before a detach or a tab switch is stale — drop it.
    if (!root || !container || !highlighter || !this.active) return;

    if (this.clustersStale) {
      this.clustersStale = false;
      this.rebuildClusters(highlighter);
    }

    const containerRect = container.getBoundingClientRect();

    this.anchorTops.clear();
    for (const cluster of this.current.clusters) {
      const top = this.anchorTopOf(cluster, containerRect, highlighter);
      if (top !== undefined) this.anchorTops.set(cluster.id, top);
    }

    this.applyPositions();

    this.current = {
      ...this.current,
      markerAnchors: highlighter.getMarkerAnchors(containerRect),
    };
    this.notify();
    exposeReady();
  }

  private rebuildClusters(highlighter: Highlighter) {
    const clusters = buildClusters(this.comments, (id) => {
      const ranges = highlighter.getRanges(id);
      if (ranges.length === 0) return null;
      return findBlockAncestor(ranges[0].startContainer);
    });

    const commentIds = this.comments.map((c) => c.id);
    const indexById = new Map<string, number>();
    for (let i = 0; i < commentIds.length; i++) {
      indexById.set(commentIds[i], i);
    }

    this.current = {
      clusters,
      commentIds,
      indexById,
      markerAnchors: this.current.markerAnchors,
    };
  }

  private anchorTopOf(
    cluster: Cluster,
    containerRect: DOMRect,
    highlighter: Highlighter,
  ): number | undefined {
    for (const comment of cluster.comments) {
      const ranges = highlighter.getRanges(comment.id);
      if (ranges.length === 0) continue;
      const paragraph = findBlockAncestor(ranges[0].startContainer);
      if (!paragraph) continue;
      return paragraph.getBoundingClientRect().top - containerRect.top;
    }
    return undefined;
  }

  private applyPositions() {
    const inputs = this.current.clusters
      .filter((c) => this.anchorTops.has(c.id))
      .map((c) => ({
        id: c.id,
        anchorTop: this.anchorTops.get(c.id) ?? 0,
        entryHeight: c.tier.height,
        entryCount: c.tier.type === TierTypes.GROUP ? 1 : c.comments.length,
      }));

    this.resolved = resolveClusterPositions(inputs, this.pendingTop);

    let maxBottom = 0;
    for (const [id, el] of this.elements) {
      const pos = this.applyClusterStyle(id, el);
      if (pos) maxBottom = Math.max(maxBottom, pos.top + pos.height);
    }

    if (this.container) {
      this.container.style.minHeight =
        maxBottom > 0 ? `${maxBottom + COLUMN_BOTTOM_PADDING_PX}px` : "";
    }
  }

  private applyClusterStyle(
    id: string,
    el: HTMLElement,
  ): ClusterPosition | undefined {
    const pos = this.resolved.get(id);
    if (!pos) {
      el.style.visibility = "hidden";
      return undefined;
    }
    el.style.top = `${pos.top}px`;
    el.style.setProperty(
      "--margin-avail-height",
      Number.isFinite(pos.availableHeight)
        ? `${pos.availableHeight}px`
        : "none",
    );
    el.style.visibility = "visible";
    return pos;
  }

  private onResize = () => {
    this.scheduleMeasure();
  };

  private notify() {
    for (const listener of this.listeners) listener(this.current);
  }
}

function exposeReady() {
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__readitPositionsReady =
      performance.now();
  }
}
