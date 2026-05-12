const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(
  createdAt: string | undefined,
  now: number = Date.now(),
): string {
  if (!createdAt) return "";
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return "";
  const diff = Math.max(0, now - created);

  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  return `${Math.floor(diff / DAY)}d`;
}
