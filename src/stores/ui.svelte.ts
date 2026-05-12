export const ui = $state({
  activeCommentId: undefined as string | undefined,
});

export function setActiveCommentId(id: string | undefined): void {
  ui.activeCommentId = id;
}
