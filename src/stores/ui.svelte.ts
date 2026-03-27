export const ui = $state({
  hoveredCommentId: undefined as string | undefined,
});

export function setHoveredCommentId(id: string | undefined): void {
  ui.hoveredCommentId = id;
}
