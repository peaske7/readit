import { client } from "../lib/client";
import { DocumentGeometry } from "../lib/geometry/document-geometry";
import type { Heading } from "../lib/headings";
import {
  AnchorConfidences,
  type Comment,
  type Document,
  type InlineData,
  type Selection,
} from "../schema";
import { initSettings } from "./settings.svelte";
import { initShortcuts } from "./shortcuts.svelte";

export interface DocumentState {
  document: Document;
  headings: Heading[];
  comments: Comment[];
  commentsError: string | null;
  sortedComments: Comment[];
  selection: Selection | null;
  pendingSelectionTop: number | undefined;
  scrollY: number;
  reanchorTarget: { commentId: string } | null;
  /** Owns highlights, clusters and margin positions for this document. */
  geometry: DocumentGeometry;
  /**
   * Set right after a successful task PATCH so the matching SSE round-trip
   * can be ignored — the optimistic DOM update is already correct, and a
   * full innerHTML swap would clobber it (visible as a "revert" flicker).
   */
  lastTaskPatchAt: number | undefined;
}

const TASK_PATCH_SSE_DEBOUNCE_MS = 800;

function createInitialDocumentState(doc: Document): DocumentState {
  return {
    document: doc,
    headings: [],
    comments: [],
    commentsError: null,
    sortedComments: [],
    selection: null,
    pendingSelectionTop: undefined,
    scrollY: 0,
    reanchorTarget: null,
    geometry: new DocumentGeometry(),
    lastTaskPatchAt: undefined,
  };
}

function sortComments(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => a.startOffset - b.startOffset);
}

export const app = $state({
  documents: new Map<string, DocumentState>(),
  activeDocumentPath: null as string | null,
  documentOrder: [] as string[],
  workingDirectory: null as string | null,
  hosted: false,
  /** True once bootstrap (or hydration) has resolved, success or failure. */
  initialized: false,
  /** Set when the initial document list failed to load. */
  loadError: null as string | null,
});

export function getActiveDocumentState(): DocumentState | undefined {
  if (!app.activeDocumentPath) return undefined;
  return app.documents.get(app.activeDocumentPath);
}

function resolveFilePath(filePath?: string): string | null {
  return filePath ?? app.activeDocumentPath;
}

function updateDocState(
  filePath: string,
  updater: (state: DocumentState) => Partial<DocumentState>,
): void {
  const docState = app.documents.get(filePath);
  if (!docState) return;

  const updates = updater(docState);
  const newDocs = new Map(app.documents);
  newDocs.set(filePath, { ...docState, ...updates });
  app.documents = newDocs;
}

function setComments(comments: Comment[], filePath?: string): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({
    comments,
    sortedComments: sortComments(comments),
  }));
}

export function setCommentsError(
  error: string | null,
  filePath?: string,
): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({ commentsError: error }));
}

export function setSelection(
  selection: Selection | null,
  filePath?: string,
): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({ selection }));
}

export function setPendingSelectionTop(
  top: number | undefined,
  filePath?: string,
): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({ pendingSelectionTop: top }));
}

export function setReanchorTarget(
  target: { commentId: string } | null,
  filePath?: string,
): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({ reanchorTarget: target }));
}

function updateDocumentHtml(html: string, filePath?: string): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, (s) => ({
    document: { ...s.document, html },
  }));
}

function setHeadings(headings: Heading[], filePath?: string): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({ headings }));
}

// --- Tab-switch scroll preservation -----------------------------------
//
// Every transition of `activeDocumentPath` goes through `openDocument`,
// `setActiveDocument` or `closeDocument`, so those three are the only
// places that need to save the outgoing document's scroll position and
// restore the incoming one — no separate "was this doc active last render"
// bookkeeping is needed.

function saveScrollPosition(filePath: string | null): void {
  if (!filePath || typeof window === "undefined") return;
  updateDocState(filePath, () => ({ scrollY: window.scrollY }));
}

function restoreScrollPosition(filePath: string): void {
  if (typeof window === "undefined") return;
  const savedY = app.documents.get(filePath)?.scrollY ?? 0;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, savedY);
    });
  });
}

/** Fetch a document's content the first time it becomes active. */
function ensureDocumentLoaded(filePath: string): void {
  const state = app.documents.get(filePath);
  if (!state || state.document.html) return;

  // `--clean` discards stored comments; neither the delete nor a missing
  // comment file should block the document from rendering.
  const loadComments = state.document.clean
    ? client
        .deleteAllComments(filePath)
        .catch(() => {})
        .then(() => [] as Comment[])
    : client.listComments(filePath).catch(() => [] as Comment[]);

  Promise.all([client.getDocument(filePath), loadComments]).then(
    ([docData, comments]) => {
      setComments(comments, filePath);
      setHeadings(docData.headings ?? [], filePath);
      updateDocumentHtml(docData.html, filePath);
    },
    (err) => {
      app.loadError =
        err instanceof Error ? err.message : "Failed to load document";
    },
  );
}

function activateDocument(nextPath: string | null): void {
  const previous = app.activeDocumentPath;
  if (previous === nextPath) return;
  saveScrollPosition(previous);
  app.activeDocumentPath = nextPath;
  if (nextPath) {
    restoreScrollPosition(nextPath);
    ensureDocumentLoaded(nextPath);
  }
}

export function openDocument(doc: Document, opts?: { active?: boolean }): void {
  const requestedActive = opts?.active ?? true;
  const nextActive =
    requestedActive || !app.activeDocumentPath
      ? doc.filePath
      : app.activeDocumentPath;

  if (app.documents.has(doc.filePath)) {
    const prevDoc = app.documents.get(doc.filePath)!;
    const newDocs = new Map(app.documents);
    newDocs.set(doc.filePath, {
      ...prevDoc,
      document: { ...prevDoc.document, ...doc },
    });
    app.documents = newDocs;
    activateDocument(nextActive);
    return;
  }

  const newDocs = new Map(app.documents);
  newDocs.set(doc.filePath, createInitialDocumentState(doc));
  app.documents = newDocs;
  app.documentOrder = [...app.documentOrder, doc.filePath];
  activateDocument(nextActive);
}

export function closeDocument(filePath: string): void {
  const docState = app.documents.get(filePath);
  const newDocs = new Map(app.documents);
  newDocs.delete(filePath);

  const newOrder = app.documentOrder.filter((p) => p !== filePath);
  const wasActive = app.activeDocumentPath === filePath;
  const oldIndex = app.documentOrder.indexOf(filePath);
  const newActive = wasActive
    ? (newOrder[oldIndex] ?? newOrder[oldIndex - 1] ?? null)
    : app.activeDocumentPath;

  app.documents = newDocs;
  app.documentOrder = newOrder;

  if (wasActive) {
    activateDocument(newActive);
  }

  docState?.geometry.dispose();
}

export function setActiveDocument(filePath: string): void {
  if (app.documents.has(filePath)) {
    activateDocument(filePath);
  }
}

export function hydrateFromInlineData(data: InlineData): void {
  app.workingDirectory = data.workingDirectory;
  app.hosted = data.hosted ?? false;

  const newDocs = new Map<string, DocumentState>();
  const order: string[] = [];

  const articleEl =
    typeof document !== "undefined"
      ? document.getElementById("document-content")
      : null;

  for (const file of data.files) {
    const docData = data.documents[file.path];
    const isActiveFile = file.path === data.activeFile;
    const doc: Document = {
      html: docData?.html ?? (isActiveFile ? (articleEl?.innerHTML ?? "") : ""),
      filePath: file.path,
      fileName: file.fileName,
      clean: data.clean,
    };

    const comments = docData?.comments ?? [];
    const headings = (docData?.headings ?? []) as Heading[];

    newDocs.set(file.path, {
      ...createInitialDocumentState(doc),
      comments,
      sortedComments: sortComments(comments),
      headings,
    });
    order.push(file.path);
  }

  app.documents = newDocs;
  app.documentOrder = order;
  app.activeDocumentPath = data.activeFile;
}

// --- Bootstrap -----------------------------------------------------------

/**
 * Fallback for when the page has no inline `#__readit` data (e.g. the Vite
 * dev server without the CLI's template). A no-op once `hydrateFromInlineData`
 * already populated the store.
 */
export async function bootstrap(): Promise<void> {
  if (app.documentOrder.length > 0) {
    app.initialized = true;
    return;
  }

  try {
    const data = await client.getDocuments();
    if (data.workingDirectory) app.workingDirectory = data.workingDirectory;

    for (const file of data.files) {
      openDocument(
        {
          html: "",
          filePath: file.path,
          fileName: file.fileName,
          clean: data.clean,
        },
        { active: false },
      );
    }

    if (data.files.length > 0) {
      setActiveDocument(data.files[0].path);
    }

    initSettings();
    initShortcuts([]);
  } catch (err) {
    app.loadError =
      err instanceof Error ? err.message : "Failed to load documents";
  } finally {
    app.initialized = true;
  }
}

export async function reload(filePath?: string): Promise<void> {
  const path = resolveFilePath(filePath);
  if (!path) return;
  try {
    const data = await client.getDocument(path);
    setHeadings(data.headings ?? [], path);
    updateDocumentHtml(data.html, path);

    const comments = await client.listComments(path).catch(() => undefined);
    if (comments) setComments(comments, path);
  } catch (err) {
    console.error("Failed to reload:", err);
  }
}

// --- Comment CRUD (optimistic, rolls back on failure) --------------------

export async function addComment(
  filePath: string,
  selectedText: string,
  commentText: string,
  startOffset: number,
  endOffset: number,
): Promise<boolean> {
  const tempId = `temp-${crypto.randomUUID()}`;
  const optimisticComment: Comment = {
    id: tempId,
    selectedText,
    comment: commentText.trim(),
    startOffset,
    endOffset,
  };

  const previousComments = [...(app.documents.get(filePath)?.comments ?? [])];

  setComments([...previousComments, optimisticComment], filePath);
  setCommentsError(null, filePath);

  try {
    const saved = await client.createComment(filePath, {
      selectedText,
      comment: commentText.trim(),
      startOffset,
      endOffset,
    });
    const current = app.documents.get(filePath)?.comments ?? [];
    setComments(
      current.map((c) => (c.id === tempId ? saved : c)),
      filePath,
    );
    return true;
  } catch (err) {
    console.error("Failed to add comment:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to add comment",
      filePath,
    );
    setComments(previousComments, filePath);
    return false;
  }
}

export async function updateComment(
  filePath: string,
  id: string,
  newText: string,
): Promise<void> {
  const trimmed = newText.trim();
  if (!trimmed) return;

  const previousComments = [...(app.documents.get(filePath)?.comments ?? [])];

  setComments(
    previousComments.map((c) => (c.id === id ? { ...c, comment: trimmed } : c)),
    filePath,
  );
  setCommentsError(null, filePath);

  try {
    await client.updateComment(filePath, id, trimmed);
  } catch (err) {
    console.error("Failed to update comment:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to update comment",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

export async function deleteComment(
  filePath: string,
  id: string,
): Promise<void> {
  const previousComments = [...(app.documents.get(filePath)?.comments ?? [])];

  setComments(
    previousComments.filter((c) => c.id !== id),
    filePath,
  );
  setCommentsError(null, filePath);

  try {
    await client.deleteComment(filePath, id);
  } catch (err) {
    console.error("Failed to delete comment:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to delete comment",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

export async function deleteAllComments(filePath: string): Promise<void> {
  const previousComments = [...(app.documents.get(filePath)?.comments ?? [])];

  setComments([], filePath);
  setCommentsError(null, filePath);

  try {
    await client.deleteAllComments(filePath);
  } catch (err) {
    console.error("Failed to delete all comments:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to delete all comments",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

export async function reanchorComment(
  filePath: string,
  id: string,
  selectedText: string,
  startOffset: number,
  endOffset: number,
): Promise<void> {
  const previousComments = [...(app.documents.get(filePath)?.comments ?? [])];

  setComments(
    previousComments.map((c) =>
      c.id === id
        ? {
            ...c,
            selectedText,
            startOffset,
            endOffset,
            anchorConfidence: AnchorConfidences.EXACT,
          }
        : c,
    ),
    filePath,
  );
  setCommentsError(null, filePath);

  try {
    const saved = await client.reanchor(filePath, id, {
      selectedText,
      startOffset,
      endOffset,
    });
    const current = app.documents.get(filePath)?.comments ?? [];
    setComments(
      current.map((c) => (c.id === id ? saved : c)),
      filePath,
    );
  } catch (err) {
    console.error("Failed to re-anchor comment:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to re-anchor comment",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

export async function toggleTask(
  filePath: string,
  index: number,
  checked: boolean,
): Promise<boolean> {
  if (!client.capabilities.patchTask) return false;

  try {
    await client.patchTask({ path: filePath, index, checked });
    updateDocState(filePath, () => ({ lastTaskPatchAt: Date.now() }));
    return true;
  } catch (err) {
    console.error("Failed to toggle task:", err);
    return false;
  }
}

// --- Live updates (SSE) ---------------------------------------------------

let documentStreamSource: EventSource | undefined;

async function refreshDocument(path: string): Promise<void> {
  const state = app.documents.get(path);
  if (!state?.document.html) return;

  // Skip if we just initiated a task PATCH — the optimistic update is
  // authoritative for our own click; refetching would flicker.
  const lastPatch = state.lastTaskPatchAt;
  if (
    lastPatch !== undefined &&
    Date.now() - lastPatch < TASK_PATCH_SSE_DEBOUNCE_MS
  ) {
    updateDocState(path, () => ({ lastTaskPatchAt: undefined }));
    return;
  }

  // A failed refetch is not worth surfacing: the stream will push again on
  // the next change.
  const [doc, comments] = await Promise.all([
    client.getDocument(path).catch(() => undefined),
    client.listComments(path).catch(() => undefined),
  ]);

  if (doc) {
    setHeadings(doc.headings ?? [], path);
    updateDocumentHtml(doc.html, path);
  }
  if (comments) {
    setComments(comments, path);
  }
}

export function startDocumentStream(): void {
  if (!client.capabilities.documentStream) return;

  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;

  function connect() {
    documentStreamSource = client.documentStream();

    documentStreamSource.onopen = () => {
      reconnectDelay = 1000;
    };

    documentStreamSource.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "document-added" && data.path) {
          openDocument(
            {
              html: "",
              filePath: data.path,
              fileName: data.fileName,
              clean: false,
            },
            { active: false },
          );
          return;
        }
        if (data.type === "document-updated" && data.path) {
          await refreshDocument(data.path);
        }
      } catch (err) {
        // SSE message parse failure — non-critical, stream will continue
        console.warn("Failed to parse document stream message:", err);
      }
    };

    documentStreamSource.onerror = () => {
      documentStreamSource?.close();
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        connect();
      }, reconnectDelay);
    };
  }

  connect();
}

export function stopDocumentStream(): void {
  documentStreamSource?.close();
  documentStreamSource = undefined;
}
