import { createStore, useStore } from "zustand";
import type { Comment, Document, Selection } from "../types";

// ─── Types ───────────────────────────────────────────────────────────

export interface DocumentState {
  document: Document;
  comments: Comment[];
  commentsError: string | null;
  sortedComments: Comment[];
  selection: Selection | null;
  pendingSelectionTop: number | undefined;
  pendingCommentText: string;
  scrollY: number;
  reanchorTarget: { commentId: string } | null;
}

export interface AppStore {
  // Multi-document state
  documents: Map<string, DocumentState>;
  activeDocumentPath: string | null;
  documentOrder: string[];
  workingDirectory: string | null;

  // Global actions
  setWorkingDirectory: (dir: string) => void;
  openDocument: (doc: Document, opts?: { active?: boolean }) => void;
  closeDocument: (filePath: string) => void;
  setActiveDocument: (filePath: string) => void;

  // Per-document setters (default to active doc)
  setComments: (comments: Comment[], filePath?: string) => void;
  setCommentsError: (error: string | null, filePath?: string) => void;
  setSelection: (selection: Selection | null, filePath?: string) => void;
  setPendingSelectionTop: (top: number | undefined, filePath?: string) => void;
  setScrollY: (y: number, filePath?: string) => void;
  setReanchorTarget: (
    target: { commentId: string } | null,
    filePath?: string,
  ) => void;
  setPendingCommentText: (text: string, filePath?: string) => void;
  updateDocumentContent: (content: string, filePath?: string) => void;

  // Helpers
  getActiveDocumentState: () => DocumentState | undefined;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function createInitialDocumentState(doc: Document): DocumentState {
  return {
    document: doc,
    comments: [],
    commentsError: null,
    sortedComments: [],
    selection: null,
    pendingSelectionTop: undefined,
    pendingCommentText: "",
    scrollY: 0,
    reanchorTarget: null,
  };
}

function sortComments(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => a.startOffset - b.startOffset);
}

// ─── Store Factory ───────────────────────────────────────────────────

export function createAppStore() {
  return createStore<AppStore>((set, get) => {
    const resolveFilePath = (filePath?: string): string | null =>
      filePath ?? get().activeDocumentPath;

    const updateDocState = (
      filePath: string,
      updater: (state: DocumentState) => Partial<DocumentState>,
    ) => {
      set((prev) => {
        const docState = prev.documents.get(filePath);
        if (!docState) return prev;
        const updates = updater(docState);
        const newDocs = new Map(prev.documents);
        newDocs.set(filePath, { ...docState, ...updates });
        return { documents: newDocs };
      });
    };

    return {
      documents: new Map(),
      activeDocumentPath: null,
      documentOrder: [],
      workingDirectory: null,

      setWorkingDirectory: (dir) => set({ workingDirectory: dir }),

      openDocument: (doc, opts) => {
        set((prev) => {
          const active = opts?.active ?? true;
          const nextActive =
            active || !prev.activeDocumentPath
              ? doc.filePath
              : prev.activeDocumentPath;

          if (prev.documents.has(doc.filePath)) {
            const newDocs = new Map(prev.documents);
            const prevDoc = newDocs.get(doc.filePath)!;
            newDocs.set(doc.filePath, {
              ...prevDoc,
              document: { ...prevDoc.document, ...doc },
            });
            return {
              documents: newDocs,
              activeDocumentPath: nextActive,
            };
          }
          const newDocs = new Map(prev.documents);
          newDocs.set(doc.filePath, createInitialDocumentState(doc));
          return {
            documents: newDocs,
            activeDocumentPath: nextActive,
            documentOrder: [...prev.documentOrder, doc.filePath],
          };
        });
      },

      closeDocument: (filePath) => {
        set((prev) => {
          const newDocs = new Map(prev.documents);
          newDocs.delete(filePath);
          const newOrder = prev.documentOrder.filter((p) => p !== filePath);

          let newActive = prev.activeDocumentPath;
          if (prev.activeDocumentPath === filePath) {
            const oldIndex = prev.documentOrder.indexOf(filePath);
            newActive = newOrder[oldIndex] ?? newOrder[oldIndex - 1] ?? null;
          }

          return {
            documents: newDocs,
            activeDocumentPath: newActive,
            documentOrder: newOrder,
          };
        });
      },

      setActiveDocument: (filePath) => {
        if (get().documents.has(filePath)) {
          set({ activeDocumentPath: filePath });
        }
      },

      setComments: (comments, filePath?) => {
        const path = resolveFilePath(filePath);
        if (!path) return;
        updateDocState(path, () => ({
          comments,
          sortedComments: sortComments(comments),
        }));
      },

      setCommentsError: (error, filePath?) => {
        const path = resolveFilePath(filePath);
        if (!path) return;
        updateDocState(path, () => ({ commentsError: error }));
      },

      setSelection: (selection, filePath?) => {
        const path = resolveFilePath(filePath);
        if (!path) return;
        updateDocState(path, () => ({ selection }));
      },

      setPendingSelectionTop: (top, filePath?) => {
        const path = resolveFilePath(filePath);
        if (!path) return;
        updateDocState(path, () => ({ pendingSelectionTop: top }));
      },

      setScrollY: (y, filePath?) => {
        const path = resolveFilePath(filePath);
        if (!path) return;
        updateDocState(path, () => ({ scrollY: y }));
      },

      setReanchorTarget: (target, filePath?) => {
        const path = resolveFilePath(filePath);
        if (!path) return;
        updateDocState(path, () => ({ reanchorTarget: target }));
      },

      setPendingCommentText: (text, filePath?) => {
        const path = resolveFilePath(filePath);
        if (!path) return;
        updateDocState(path, () => ({ pendingCommentText: text }));
      },

      updateDocumentContent: (content, filePath?) => {
        const path = resolveFilePath(filePath);
        if (!path) return;
        updateDocState(path, (s) => ({
          document: { ...s.document, content },
        }));
      },

      getActiveDocumentState: () => {
        const { documents, activeDocumentPath } = get();
        if (!activeDocumentPath) return undefined;
        return documents.get(activeDocumentPath);
      },
    };
  });
}

// ─── Singleton + React Hook ─────────────────────────────────────────

export const appStore = createAppStore();

export function useAppStore<T>(selector: (state: AppStore) => T): T {
  return useStore(appStore, selector);
}

// ─── UI Store (high-frequency, flat, no Map overhead) ───────────────

interface UIState {
  hoveredCommentId: string | undefined;
}

export const uiStore = createStore<UIState>(() => ({
  hoveredCommentId: undefined,
}));

export function useUI<T>(selector: (s: UIState) => T): T {
  return useStore(uiStore, selector);
}
