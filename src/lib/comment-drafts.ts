const PREFIX = "readit:draft:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface DraftRecord {
  text: string;
  savedAtMs: number;
}

function key(filePath: string, startOffset: number, endOffset: number): string {
  return `${PREFIX}${filePath}::${startOffset}::${endOffset}`;
}

export function saveDraft(
  filePath: string,
  startOffset: number,
  endOffset: number,
  text: string,
): void {
  try {
    if (!text) {
      localStorage.removeItem(key(filePath, startOffset, endOffset));
      return;
    }
    const record: DraftRecord = { text, savedAtMs: Date.now() };
    localStorage.setItem(
      key(filePath, startOffset, endOffset),
      JSON.stringify(record),
    );
  } catch {
    // localStorage may be unavailable or quota exceeded
  }
}

export function loadDraft(
  filePath: string,
  startOffset: number,
  endOffset: number,
): string | null {
  try {
    const raw = localStorage.getItem(key(filePath, startOffset, endOffset));
    if (!raw) return null;
    const record = JSON.parse(raw) as DraftRecord;
    if (Date.now() - record.savedAtMs > TTL_MS) {
      localStorage.removeItem(key(filePath, startOffset, endOffset));
      return null;
    }
    return record.text || null;
  } catch {
    return null;
  }
}

export function clearDraft(
  filePath: string,
  startOffset: number,
  endOffset: number,
): void {
  try {
    localStorage.removeItem(key(filePath, startOffset, endOffset));
  } catch {
    // localStorage may be unavailable
  }
}

export function purgeExpiredDrafts(): void {
  try {
    const now = Date.now();
    const toDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const record = JSON.parse(raw) as DraftRecord;
        if (now - record.savedAtMs > TTL_MS) toDelete.push(k);
      } catch {
        toDelete.push(k);
      }
    }
    for (const k of toDelete) localStorage.removeItem(k);
  } catch {
    // localStorage may be unavailable
  }
}
