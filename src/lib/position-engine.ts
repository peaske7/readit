import { resolveMarginNotePositions } from "./margin-layout";

type Listener = () => void;

/**
 * PositionEngine — manages all highlight/margin-note positioning outside React.
 *
 * Key insight: container-relative positions (markRect.top - containerRect.top) are
 * scroll-invariant — both the mark and container move by the same scroll delta.
 * So positions only change on highlight mutation and window resize, NOT on scroll.
 *
 * The engine:
 * 1. Caches positions on mutation/resize (rare)
 * 2. Resolves margin note overlaps (same algorithm as before)
 * 3. Writes style.top directly to registered DOM elements (zero React renders)
 * 4. Notifies minimap subscribers when document-absolute positions change (rare)
 */
export class PositionEngine {
  /** Container-relative positions keyed by commentId (for margin notes). */
  private positions = new Map<string, number>();
  /** Document-absolute positions keyed by commentId (for minimap). */
  private docPositions = new Map<string, number>();
  /** Cached snapshot for useSyncExternalStore (must be referentially stable). */
  private docPositionsSnapshot: Record<string, number> = {};
  /** Registered margin note DOM elements. */
  private noteElements = new Map<string, HTMLElement>();
  /** Comment IDs in document order (for overlap resolution). */
  private commentIds: string[] = [];
  /** Position of the pending comment input zone. */
  private pendingTop: number | undefined;
  /** Subscribers notified when document positions change (minimap). */
  private listeners = new Set<Listener>();
  /** Highlight root element (article) for querying marks. */
  private root: HTMLElement | null = null;
  /** Outer container element for relative offset calculation. */
  private container: HTMLElement | null = null;
  /** RAF handle for throttled resize. */
  private resizeRafId: number | null = null;

  /** Bind to the DOM elements that hold highlights. */
  attach(root: HTMLElement, container: HTMLElement) {
    this.root = root;
    this.container = container;
    window.addEventListener("resize", this.handleResize);
  }

  /** Unbind from DOM. */
  detach() {
    window.removeEventListener("resize", this.handleResize);
    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }
    this.root = null;
    this.container = null;
  }

  /**
   * Cache positions by reading mark elements from the DOM.
   * Called after highlights are applied (rare — comment add/delete/edit only).
   */
  cachePositions() {
    if (!this.root || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const scrollY = window.scrollY;

    this.positions.clear();
    this.docPositions.clear();

    const marks = this.root.querySelectorAll("mark[data-comment-id]");
    for (const mark of marks) {
      const id = mark.getAttribute("data-comment-id");
      if (!id || this.positions.has(id)) continue;

      const rect = mark.getBoundingClientRect();
      this.positions.set(id, rect.top - containerRect.top);
      this.docPositions.set(id, rect.top + scrollY);
    }

    this.rebuildSnapshot();
    this.applyPositions();
    this.notify();
  }

  /**
   * Accept positions reported from an external source (iframe).
   * The iframe computes positions internally and sends them via postMessage.
   */
  setExternalPositions(
    positions: Record<string, number>,
    documentPositions: Record<string, number>,
  ) {
    this.positions.clear();
    this.docPositions.clear();

    for (const [id, top] of Object.entries(positions)) {
      this.positions.set(id, top);
    }
    for (const [id, top] of Object.entries(documentPositions)) {
      this.docPositions.set(id, top);
    }

    this.rebuildSnapshot();
    this.applyPositions();
    this.notify();
  }

  /** Update the ordered list of comment IDs (for overlap resolution). */
  setCommentIds(ids: string[]) {
    this.commentIds = ids;
  }

  /** Update the pending comment input position (for overlap avoidance). */
  setPendingSelectionTop(top: number | undefined) {
    if (this.pendingTop === top) return;
    this.pendingTop = top;
    this.applyPositions();
  }

  /** Register a margin note DOM element for direct position updates. */
  registerNote(commentId: string, element: HTMLElement) {
    this.noteElements.set(commentId, element);
    // Apply cached position immediately if available
    const resolved = this.resolvePositions();
    const top = resolved.get(commentId);
    if (top !== undefined) {
      element.style.top = `${top}px`;
      element.style.visibility = "visible";
    } else {
      element.style.visibility = "hidden";
    }
  }

  /** Unregister a margin note DOM element. */
  unregisterNote(commentId: string) {
    this.noteElements.delete(commentId);
  }

  /** Get document-absolute positions (for minimap rendering). */
  getDocumentPositions(): Record<string, number> {
    return this.docPositionsSnapshot;
  }

  /** Subscribe to position changes (for minimap). Returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Clean up all state and listeners. */
  dispose() {
    this.detach();
    this.positions.clear();
    this.docPositions.clear();
    this.docPositionsSnapshot = {};
    this.noteElements.clear();
    this.listeners.clear();
    this.commentIds = [];
  }

  // ─── Private ──────────────────────────────────────────────────────

  private rebuildSnapshot() {
    const result: Record<string, number> = {};
    for (const [id, top] of this.docPositions) {
      result[id] = top;
    }
    this.docPositionsSnapshot = result;
  }

  private resolvePositions(): Map<string, number> {
    const highlightPositions: Record<string, number> = {};
    for (const [id, top] of this.positions) {
      highlightPositions[id] = top;
    }
    return resolveMarginNotePositions(
      this.commentIds,
      highlightPositions,
      this.pendingTop,
    );
  }

  private applyPositions() {
    const resolved = this.resolvePositions();
    for (const [commentId, element] of this.noteElements) {
      const top = resolved.get(commentId);
      if (top !== undefined) {
        element.style.top = `${top}px`;
        element.style.visibility = "visible";
      } else {
        element.style.visibility = "hidden";
      }
    }
  }

  private handleResize = () => {
    if (this.resizeRafId !== null) return;
    this.resizeRafId = requestAnimationFrame(() => {
      this.cachePositions();
      this.resizeRafId = null;
    });
  };

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
