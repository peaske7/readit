// Inlined to avoid module import issues in Worker context
function find(
  text: string,
  needle: string,
  hint?: number,
): { start: number; end: number } | undefined {
  if (!needle || !text) return undefined;

  const hits: number[] = [];
  let i = 0;
  for (;;) {
    i = text.indexOf(needle, i);
    if (i === -1) break;
    hits.push(i);
    i += 1;
  }

  if (hits.length === 0) return undefined;
  if (hits.length === 1)
    return { start: hits[0], end: hits[0] + needle.length };

  const target = hint ?? 0;
  let best = hits[0];
  let bestDist = Math.abs(best - target);
  for (const h of hits) {
    const d = Math.abs(h - target);
    if (d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return { start: best, end: best + needle.length };
}

self.onmessage = (e: MessageEvent) => {
  const { id, textContent, comments } = e.data;
  const results: { id: string; start: number; end: number }[] = [];

  for (const c of comments) {
    const pos = find(textContent, c.selectedText, c.startOffset);
    if (pos) results.push({ id: c.id, ...pos });
  }

  self.postMessage({ id, results });
};
