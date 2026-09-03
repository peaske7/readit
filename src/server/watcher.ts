import { type FSWatcher, watch } from "node:fs";
import * as fs from "node:fs/promises";

const DEBOUNCE_MS = 100;
const REWATCH_RETRIES = 10;
const REWATCH_INTERVAL_MS = 200;

/**
 * Watches document files and reports debounced changes.
 *
 * Editors that save by writing a temp file and renaming it over the original
 * (Vim, Neovim, Emacs) invalidate the underlying `fs.watch` handle, so a
 * "rename" waits for the file to reappear, re-establishes the watch, and then
 * reports the change like any other edit — one update path for both cases.
 * Mirrors `go/internal/server/watcher.go`.
 */
export class FileWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly rewatching = new Set<string>();
  private closed = false;

  constructor(private readonly onChange: (filePath: string) => void) {}

  add(filePath: string): void {
    if (this.closed || this.watchers.has(filePath)) return;

    try {
      const watcher = watch(filePath, (eventType) => {
        if (eventType === "rename") {
          void this.rewatch(filePath);
          return;
        }
        if (eventType === "change") {
          this.debounce(filePath);
        }
      });
      this.watchers.set(filePath, watcher);
    } catch (err) {
      console.warn(`File watching not available for ${filePath}:`, err);
    }
  }

  /** Re-establish a watch whose file was replaced or briefly removed. */
  async rewatch(filePath: string): Promise<void> {
    if (this.closed || this.rewatching.has(filePath)) return;
    this.rewatching.add(filePath);

    try {
      for (let i = 0; i < REWATCH_RETRIES; i++) {
        await new Promise((r) => setTimeout(r, REWATCH_INTERVAL_MS));
        if (this.closed) return;

        try {
          await fs.access(filePath);
        } catch {
          continue; // File not yet recreated, keep retrying.
        }

        this.stopWatching(filePath);
        this.rewatching.delete(filePath);
        this.add(filePath);
        this.debounce(filePath);
        return;
      }
      console.warn(`File did not reappear after rename: ${filePath}`);
    } finally {
      this.rewatching.delete(filePath);
    }
  }

  close(): void {
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const filePath of [...this.watchers.keys()]) {
      this.stopWatching(filePath);
    }
  }

  private stopWatching(filePath: string): void {
    const watcher = this.watchers.get(filePath);
    if (!watcher) return;
    try {
      watcher.close();
    } catch {
      // Already closed by the runtime.
    }
    this.watchers.delete(filePath);
  }

  private debounce(filePath: string): void {
    const existing = this.timers.get(filePath);
    if (existing) clearTimeout(existing);

    this.timers.set(
      filePath,
      setTimeout(() => {
        this.timers.delete(filePath);
        this.onChange(filePath);
      }, DEBOUNCE_MS),
    );
  }
}
