const COLOR_COUNT = 4;

interface CommentEntry {
  ranges: Range[];
  colorIndex: number;
}

export class HighlightRegistry {
  private comments = new Map<string, CommentEntry>();
  private focusedId: string | undefined;

  updateComment(commentId: string, ranges: Range[], colorIndex: number): void {
    this.comments.set(commentId, { ranges, colorIndex });
    this.syncCommentHighlights();
  }

  removeComment(commentId: string): void {
    this.comments.delete(commentId);
    if (this.focusedId === commentId) {
      this.focusedId = undefined;
      this.syncFocused();
    }
    this.syncCommentHighlights();
  }

  clearAll(): void {
    this.comments.clear();
    this.focusedId = undefined;

    for (let i = 0; i < COLOR_COUNT; i++) {
      CSS.highlights.delete(`comment-color-${i}`);
    }
    CSS.highlights.delete("comment-focused");
    this.exposeIds();
  }

  setPending(ranges: Range[]): void {
    if (ranges.length > 0) {
      CSS.highlights.set("pending-selection", new Highlight(...ranges));
    } else {
      CSS.highlights.delete("pending-selection");
    }
  }

  setFocused(commentId: string | undefined): void {
    this.focusedId = commentId;
    this.syncFocused();
  }

  getRanges(commentId: string): Range[] {
    return this.comments.get(commentId)?.ranges ?? [];
  }

  getMarkerAnchors(
    containerRect: DOMRect,
  ): Map<string, { top: number; left: number }> {
    const anchors = new Map<string, { top: number; left: number }>();
    for (const [id, entry] of this.comments) {
      if (entry.ranges.length === 0) continue;
      const rects = entry.ranges[0].getClientRects();
      const last = rects[rects.length - 1];
      if (!last) continue;
      anchors.set(id, {
        top: last.top - containerRect.top,
        left: last.right - containerRect.left,
      });
    }
    return anchors;
  }

  scrollToComment(commentId: string): void {
    const entry = this.comments.get(commentId);
    if (!entry || entry.ranges.length === 0) return;

    const range = entry.ranges[0];
    const el = range.startContainer.parentElement;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  hitTest(x: number, y: number): string | undefined {
    const pos = caretPositionFromPointCompat(x, y);
    if (!pos) return undefined;

    for (const [id, entry] of this.comments) {
      for (const range of entry.ranges) {
        if (rangeContainsPosition(range, pos.node, pos.offset)) {
          return id;
        }
      }
    }
    return undefined;
  }

  dispose(): void {
    this.clearAll();
    this.setPending([]);
  }

  private syncCommentHighlights(): void {
    const byColor = new Map<number, Range[]>();
    for (let i = 0; i < COLOR_COUNT; i++) {
      byColor.set(i, []);
    }

    for (const entry of this.comments.values()) {
      const bucket = byColor.get(entry.colorIndex % COLOR_COUNT)!;
      bucket.push(...entry.ranges);
    }

    for (let i = 0; i < COLOR_COUNT; i++) {
      const ranges = byColor.get(i)!;
      if (ranges.length > 0) {
        CSS.highlights.set(`comment-color-${i}`, new Highlight(...ranges));
      } else {
        CSS.highlights.delete(`comment-color-${i}`);
      }
    }

    this.syncFocused();
    this.exposeIds();
  }

  private syncFocused(): void {
    if (!this.focusedId) {
      CSS.highlights.delete("comment-focused");
      return;
    }

    const entry = this.comments.get(this.focusedId);
    if (!entry || entry.ranges.length === 0) {
      CSS.highlights.delete("comment-focused");
      return;
    }

    CSS.highlights.set("comment-focused", new Highlight(...entry.ranges));
  }

  private exposeIds(): void {
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__readitHighlights = {
        commentIds: [...this.comments.keys()],
      };
    }
  }
}

interface CaretPosition {
  node: Node;
  offset: number;
}

function caretPositionFromPointCompat(
  x: number,
  y: number,
): CaretPosition | null {
  if ("caretPositionFromPoint" in document) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos) return { node: pos.offsetNode, offset: pos.offset };
  }

  if ("caretRangeFromPoint" in document) {
    const range = (
      document as unknown as {
        caretRangeFromPoint(x: number, y: number): Range | null;
      }
    ).caretRangeFromPoint(x, y);
    if (range) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }

  return null;
}

function rangeContainsPosition(
  range: Range,
  node: Node,
  offset: number,
): boolean {
  try {
    const cmp1 = range.comparePoint(node, offset);
    return cmp1 === 0;
  } catch {
    return false;
  }
}
