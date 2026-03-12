import {
  COMMENT_INPUT_HEIGHT_PX,
  MARGIN_NOTE_MIN_GAP_PX,
} from "./layout-constants";

interface NotePosition {
  commentId: string;
  top: number;
}

/**
 * Resolves margin note positions to avoid overlaps.
 *
 * Algorithm:
 * 1. Build initial positions from highlight positions
 * 2. Handle input zone collision (push notes up or down to avoid input)
 * 3. Resolve note-to-note overlaps:
 *    - Pass 1: Notes above input zone → push UP
 *    - Pass 2: Notes at/below input zone → push DOWN
 *
 * @param commentIds - Comment IDs in document order (sorted by startOffset)
 * @param highlightPositions - Map of comment ID to top position
 * @param pendingSelectionTop - Top position of input zone (if any)
 * @returns Map of comment ID to resolved top position
 */
export function resolveMarginNotePositions(
  commentIds: string[],
  highlightPositions: Record<string, number>,
  pendingSelectionTop: number | undefined,
): Map<string, number> {
  // Only include comments with known positions (avoids jolt to position 0)
  const positions: NotePosition[] = commentIds
    .filter((id) => id in highlightPositions)
    .map((id) => ({
      commentId: id,
      top: highlightPositions[id],
    }));

  // Sort by top position
  positions.sort((a, b) => a.top - b.top);

  // Handle input zone collision - check visual overlap, not just top position
  if (pendingSelectionTop !== null && pendingSelectionTop !== undefined) {
    const inputStart = pendingSelectionTop;
    const inputEnd = pendingSelectionTop + COMMENT_INPUT_HEIGHT_PX;

    for (const pos of positions) {
      const noteBottom = pos.top + MARGIN_NOTE_MIN_GAP_PX;

      // Check if note visually overlaps with input zone
      const overlaps = noteBottom > inputStart && pos.top < inputEnd;

      if (overlaps) {
        if (pos.top < inputStart) {
          // Note is above input but overlaps - push UP
          pos.top = Math.max(0, inputStart - MARGIN_NOTE_MIN_GAP_PX);
        } else {
          // Note is within/below input zone - push DOWN
          pos.top = inputEnd;
        }
      }
    }
    // Re-sort after potential position changes
    positions.sort((a, b) => a.top - b.top);
  }

  // Resolve note-to-note overlaps
  const inputStartForOverlap = pendingSelectionTop ?? Infinity;
  const inputEndForOverlap =
    pendingSelectionTop != null
      ? pendingSelectionTop + COMMENT_INPUT_HEIGHT_PX
      : Infinity;

  // Pass 1: Notes ABOVE input - resolve by pushing UP (bottom to top)
  for (let i = positions.length - 2; i >= 0; i--) {
    const curr = positions[i];
    const next = positions[i + 1];
    // Only process if next note is above the input zone
    if (next.top >= inputStartForOverlap) continue;
    if (next.top - curr.top < MARGIN_NOTE_MIN_GAP_PX) {
      curr.top = Math.max(0, next.top - MARGIN_NOTE_MIN_GAP_PX);
    }
  }

  // Pass 2: Notes at/below input - resolve by pushing DOWN (top to bottom)
  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    if (curr.top - prev.top < MARGIN_NOTE_MIN_GAP_PX) {
      let newTop = prev.top + MARGIN_NOTE_MIN_GAP_PX;
      // If new position lands in input zone, skip to below input
      if (newTop >= inputStartForOverlap && newTop < inputEndForOverlap) {
        newTop = inputEndForOverlap;
      }
      curr.top = newTop;
    }
  }

  return new Map(positions.map((p) => [p.commentId, p.top]));
}
