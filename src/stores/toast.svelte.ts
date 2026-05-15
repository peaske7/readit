export const toast = $state({
  message: "" as string,
  visible: false as boolean,
});

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, durationMs = 2000): void {
  toast.message = message;
  toast.visible = true;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toast.visible = false;
  }, durationMs);
}
