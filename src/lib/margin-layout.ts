const MARGIN_NOTE_MIN_GAP_PX = 150;
const COMMENT_INPUT_HEIGHT_PX = 160;

interface NotePosition {
  commentId: string;
  top: number;
}

export function resolveMarginNotePositions(
  commentIds: string[],
  highlightPositions: Record<string, number>,
  pendingSelectionTop: number | undefined,
): Map<string, number> {
  const positions: NotePosition[] = commentIds
    .filter((id) => id in highlightPositions)
    .map((id) => ({
      commentId: id,
      top: highlightPositions[id],
    }));

  positions.sort((a, b) => a.top - b.top);

  if (pendingSelectionTop !== null && pendingSelectionTop !== undefined) {
    const inputStart = pendingSelectionTop;
    const inputEnd = pendingSelectionTop + COMMENT_INPUT_HEIGHT_PX;

    for (const pos of positions) {
      const noteBottom = pos.top + MARGIN_NOTE_MIN_GAP_PX;

      const overlaps = noteBottom > inputStart && pos.top < inputEnd;

      if (overlaps) {
        if (pos.top < inputStart) {
          pos.top = Math.max(0, inputStart - MARGIN_NOTE_MIN_GAP_PX);
        } else {
          pos.top = inputEnd;
        }
      }
    }
    positions.sort((a, b) => a.top - b.top);
  }

  const inputStartForOverlap = pendingSelectionTop ?? Infinity;
  const inputEndForOverlap =
    pendingSelectionTop != null
      ? pendingSelectionTop + COMMENT_INPUT_HEIGHT_PX
      : Infinity;

  for (let i = positions.length - 2; i >= 0; i--) {
    const curr = positions[i];
    const next = positions[i + 1];
    if (next.top >= inputStartForOverlap) continue;
    if (next.top - curr.top < MARGIN_NOTE_MIN_GAP_PX) {
      curr.top = Math.max(0, next.top - MARGIN_NOTE_MIN_GAP_PX);
    }
  }

  for (let i = 1; i < positions.length; i++) {
    const prev = positions[i - 1];
    const curr = positions[i];
    if (curr.top - prev.top < MARGIN_NOTE_MIN_GAP_PX) {
      let newTop = prev.top + MARGIN_NOTE_MIN_GAP_PX;
      if (newTop >= inputStartForOverlap && newTop < inputEndForOverlap) {
        newTop = inputEndForOverlap;
      }
      curr.top = newTop;
    }
  }

  return new Map(positions.map((p) => [p.commentId, p.top]));
}
