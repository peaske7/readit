import * as fs from "node:fs/promises";
import { basename, dirname } from "node:path";
import {
  computeHash,
  createComment,
  getCommentPath,
  getLineHint,
  parseCommentFile,
  serializeComments,
  truncateSelection,
} from "../lib/comment-storage.js";
import type { Heading } from "../lib/headings.js";
import { createKeyLock } from "../lib/key-lock.js";
import {
  renderMarkdown,
  toggleTaskInSource,
} from "../lib/markdown-renderer.js";
import { resolveComments } from "../lib/resolve-comments.js";
import { AnchorConfidences, type Comment } from "../schema.js";
import { FileWatcher } from "./watcher.js";

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

export interface FileEntry {
  content?: string;
  filePath: string;
}

export interface DocumentFile {
  path: string;
  fileName: string;
}

export interface RenderedDocument {
  html: string;
  headings: Heading[];
}

export type RenderDocument = (content: string) => Promise<RenderedDocument>;

export interface DocumentSessionOptions {
  files: FileEntry[];
  clean?: boolean;
  /** Injected so tests do not pay for shiki/mermaid. */
  render?: RenderDocument;
}

export type SessionEvent =
  | { type: "document-updated"; path: string }
  | { type: "document-added"; path: string; fileName: string };

export type SessionListener = (event: SessionEvent) => void;

/** A rendered app page, cached until the document or its comments change. */
export interface CachedPage {
  html: string;
  gzip: Uint8Array<ArrayBuffer>;
}

export const TaskPatchResults = {
  OK: "ok",
  UNCHANGED: "unchanged",
  OUT_OF_RANGE: "out-of-range",
} as const;
export type TaskPatchResult =
  (typeof TaskPatchResults)[keyof typeof TaskPatchResults];

export interface NewCommentInput {
  selectedText: string;
  comment: string;
  startOffset: number;
  endOffset: number;
}

export interface ReanchorInput {
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

interface FileState {
  content: string | null;
  rendered: RenderedDocument | null;
  isLoaded: boolean;
}

interface ResolvedCommentsCacheEntry {
  commentMtimeMs: number;
  sourceHash: string;
  comments: Comment[];
}

const withCommentLock = createKeyLock("comments");
const withSourceLock = createKeyLock("source");

/**
 * The documents a `readit` server has open: their content, their comments,
 * the file watcher that keeps both fresh, and the caches in front of them.
 * Knows nothing about HTTP.
 */
export class DocumentSession {
  readonly defaultPath: string;

  private readonly files = new Map<string, FileState>();
  private readonly fileOrder: string[] = [];
  private readonly resolvedComments = new Map<
    string,
    ResolvedCommentsCacheEntry
  >();
  private readonly pages = new Map<string, CachedPage>();
  private readonly listeners = new Set<SessionListener>();
  private readonly watcher: FileWatcher;
  private readonly render: RenderDocument;

  constructor(options: DocumentSessionOptions) {
    this.render = options.render ?? renderMarkdown;
    this.watcher = new FileWatcher((filePath) => {
      void this.reload(filePath);
    });

    for (const entry of options.files) {
      this.files.set(entry.filePath, {
        content: entry.content ?? null,
        rendered: null,
        isLoaded: entry.content !== undefined,
      });
      this.fileOrder.push(entry.filePath);

      if (options.clean) {
        fs.unlink(getCommentPath(entry.filePath)).catch(() => {});
        this.resolvedComments.delete(entry.filePath);
      }
    }

    this.defaultPath = this.fileOrder[0];
    for (const filePath of this.fileOrder) this.watcher.add(filePath);
  }

  listFiles(): DocumentFile[] {
    return this.fileOrder.map((path) => ({ path, fileName: basename(path) }));
  }

  hasFile(filePath: string): boolean {
    return this.files.has(filePath);
  }

  /** `filePath` must already be canonical; returns whether it was new. */
  addFile(filePath: string): "present" | "added" {
    if (this.files.has(filePath)) return "present";

    this.files.set(filePath, {
      content: null,
      rendered: null,
      isLoaded: false,
    });
    this.fileOrder.push(filePath);
    this.watcher.add(filePath);
    this.emit({
      type: "document-added",
      path: filePath,
      fileName: basename(filePath),
    });
    return "added";
  }

  async getContent(filePath: string): Promise<string> {
    const state = this.state(filePath);
    if (state.isLoaded && state.content !== null) return state.content;

    state.content = await fs.readFile(filePath, "utf-8");
    state.isLoaded = true;
    return state.content;
  }

  async getDocument(filePath: string): Promise<RenderedDocument> {
    const state = this.state(filePath);
    if (state.rendered) return state.rendered;

    state.rendered = await this.render(await this.getContent(filePath));
    return state.rendered;
  }

  /** Comments resolved against the current source and rendered HTML. */
  async listComments(filePath: string): Promise<Comment[]> {
    const { html } = await this.getDocument(filePath);
    return this.readComments(filePath, await this.getContent(filePath), html);
  }

  async createComment(
    filePath: string,
    input: NewCommentInput,
  ): Promise<Comment> {
    const content = await this.getContent(filePath);
    const comment = createComment(
      input.selectedText,
      input.comment,
      input.startOffset,
      input.endOffset,
      content,
    );

    await withCommentLock(filePath, async () => {
      const existing = await this.readComments(filePath, content);
      await this.writeComments(filePath, content, [...existing, comment]);
    });

    return comment;
  }

  async updateComment(
    filePath: string,
    id: string,
    text: string,
  ): Promise<Comment | undefined> {
    const content = await this.getContent(filePath);
    return withCommentLock(filePath, async () => {
      const existing = await this.readComments(filePath, content);
      const index = existing.findIndex((c) => c.id === id);
      if (index === -1) return undefined;

      const updated = existing.map((c, i) =>
        i === index ? { ...c, comment: text.trim() } : c,
      );
      await this.writeComments(filePath, content, updated);
      return updated[index];
    });
  }

  async deleteComment(filePath: string, id: string): Promise<boolean> {
    const content = await this.getContent(filePath);
    return withCommentLock(filePath, async () => {
      const existing = await this.readComments(filePath, content);
      const remaining = existing.filter((c) => c.id !== id);
      if (remaining.length === existing.length) return false;

      if (remaining.length === 0) {
        await this.deleteCommentFile(filePath);
      } else {
        await this.writeComments(filePath, content, remaining);
      }
      return true;
    });
  }

  async deleteAllComments(filePath: string): Promise<void> {
    await withCommentLock(filePath, () => this.deleteCommentFile(filePath));
  }

  async reanchor(
    filePath: string,
    id: string,
    input: ReanchorInput,
  ): Promise<Comment | undefined> {
    const content = await this.getContent(filePath);
    return withCommentLock(filePath, async () => {
      const existing = await this.readComments(filePath, content);
      const index = existing.findIndex((c) => c.id === id);
      if (index === -1) return undefined;

      const reanchored: Comment = {
        ...existing[index],
        selectedText: truncateSelection(input.selectedText),
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        lineHint: getLineHint(content, input.startOffset, input.endOffset),
        anchorConfidence: AnchorConfidences.EXACT,
        anchorPrefix:
          input.selectedText.length > 1000
            ? input.selectedText.slice(0, 200)
            : undefined,
      };
      await this.writeComments(
        filePath,
        content,
        existing.map((c, i) => (i === index ? reanchored : c)),
      );
      return reanchored;
    });
  }

  /** The `.comments.md` file as stored on disk, for the raw view. */
  async getRawComments(
    filePath: string,
  ): Promise<{ content: string | null; path: string }> {
    const commentPath = getCommentPath(filePath);
    try {
      return {
        content: await fs.readFile(commentPath, "utf-8"),
        path: commentPath,
      };
    } catch (err) {
      if (isErrnoException(err) && err.code === "ENOENT") {
        return { content: null, path: commentPath };
      }
      throw err;
    }
  }

  /** Toggle the nth task checkbox in the source file itself. */
  async patchTask(
    filePath: string,
    index: number,
    checked: boolean,
  ): Promise<TaskPatchResult> {
    // Serialize per-file: rapid clicks otherwise race on read-modify-write.
    return withSourceLock(filePath, async () => {
      const current = await fs.readFile(filePath, "utf-8");
      const updated = toggleTaskInSource(current, index, checked);
      if (updated === null) return TaskPatchResults.OUT_OF_RANGE;
      if (updated === current) return TaskPatchResults.UNCHANGED;

      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmpPath, updated, "utf-8");
      await fs.rename(tmpPath, filePath);
      return TaskPatchResults.OK;
    });
  }

  /** Someone changed the comment file behind our back (e.g. `readit share`). */
  invalidateComments(filePath: string): void {
    this.resolvedComments.delete(filePath);
    this.pages.delete(filePath);
    this.emit({ type: "document-updated", path: filePath });
  }

  getCachedPage(filePath: string): CachedPage | undefined {
    return this.pages.get(filePath);
  }

  cachePage(filePath: string, page: CachedPage): void {
    this.pages.set(filePath, page);
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.watcher.close();
    this.listeners.clear();
  }

  private state(filePath: string): FileState {
    const state = this.files.get(filePath);
    if (!state) throw new Error(`File not found: ${filePath}`);
    return state;
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** Pick up an edit made on disk; the single update path for the watcher. */
  private async reload(filePath: string): Promise<void> {
    const state = this.files.get(filePath);
    if (!state) return;

    try {
      const content = await fs.readFile(filePath, "utf-8");
      if (state.isLoaded && content === state.content) return;

      state.content = content;
      state.rendered = null;
      state.isLoaded = true;
      this.resolvedComments.delete(filePath);
      this.pages.clear();
      console.log(`File changed: ${basename(filePath)}`);
      this.emit({ type: "document-updated", path: filePath });
    } catch (err) {
      // The file may be gone mid rename-save; the watcher waits for it back.
      if (isErrnoException(err) && err.code === "ENOENT") {
        void this.watcher.rewatch(filePath);
        return;
      }
      console.error(`Failed to read updated file ${filePath}:`, err);
    }
  }

  private async readComments(
    filePath: string,
    sourceContent: string,
    renderedHtml?: string,
  ): Promise<Comment[]> {
    const commentPath = getCommentPath(filePath);
    const sourceHash = computeHash(sourceContent);

    try {
      const stats = await fs.stat(commentPath);
      const cached = this.resolvedComments.get(filePath);
      if (
        cached &&
        cached.sourceHash === sourceHash &&
        cached.commentMtimeMs === stats.mtimeMs
      ) {
        return cached.comments;
      }

      const file = parseCommentFile(await fs.readFile(commentPath, "utf-8"));
      const comments = resolveComments({
        comments: file.comments,
        source: sourceContent,
        html: renderedHtml,
      });

      this.resolvedComments.set(filePath, {
        sourceHash,
        commentMtimeMs: stats.mtimeMs,
        comments,
      });
      return comments;
    } catch (err) {
      if (isErrnoException(err) && err.code === "ENOENT") {
        this.resolvedComments.delete(filePath);
        return [];
      }
      throw err;
    }
  }

  private async writeComments(
    filePath: string,
    sourceContent: string,
    comments: Comment[],
  ): Promise<void> {
    const commentPath = getCommentPath(filePath);
    await fs.mkdir(dirname(commentPath), { recursive: true });

    const content = serializeComments({
      source: filePath,
      hash: computeHash(sourceContent),
      version: 1,
      comments,
    });
    const tempPath = `${commentPath}.tmp`;
    await fs.writeFile(tempPath, content, "utf-8");
    await fs.rename(tempPath, commentPath);
    this.invalidate(filePath);
  }

  private async deleteCommentFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(getCommentPath(filePath));
    } catch (err) {
      if (!isErrnoException(err) || err.code !== "ENOENT") throw err;
    }
    this.invalidate(filePath);
  }

  private invalidate(filePath: string): void {
    this.resolvedComments.delete(filePath);
    this.pages.delete(filePath);
  }
}
