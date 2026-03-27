import type { Heading } from "../lib/headings";
import type { Comment, Document, Selection } from "../schema";

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
}

interface InlineData {
  files: { path: string; fileName: string }[];
  activeFile: string;
  clean: boolean;
  workingDirectory: string;
  documents: Record<
    string,
    {
      html: string;
      headings: { id: string; text: string; level: number }[];
      comments: Comment[];
    }
  >;
  settings: { version: number; fontFamily: string };
}

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
});

export function getActiveDocumentState(): DocumentState | undefined {
  if (!app.activeDocumentPath) return undefined;
  return app.documents.get(app.activeDocumentPath);
}

export function setWorkingDirectory(dir: string): void {
  app.workingDirectory = dir;
}

export function openDocument(doc: Document, opts?: { active?: boolean }): void {
  const active = opts?.active ?? true;
  const nextActive =
    active || !app.activeDocumentPath ? doc.filePath : app.activeDocumentPath;

  if (app.documents.has(doc.filePath)) {
    const prevDoc = app.documents.get(doc.filePath)!;
    const newDocs = new Map(app.documents);
    newDocs.set(doc.filePath, {
      ...prevDoc,
      document: { ...prevDoc.document, ...doc },
    });
    app.documents = newDocs;
    app.activeDocumentPath = nextActive;
    return;
  }

  const newDocs = new Map(app.documents);
  newDocs.set(doc.filePath, createInitialDocumentState(doc));
  app.documents = newDocs;
  app.activeDocumentPath = nextActive;
  app.documentOrder = [...app.documentOrder, doc.filePath];
}

export function closeDocument(filePath: string): void {
  const newDocs = new Map(app.documents);
  newDocs.delete(filePath);

  const newOrder = app.documentOrder.filter((p) => p !== filePath);

  let newActive = app.activeDocumentPath;
  if (app.activeDocumentPath === filePath) {
    const oldIndex = app.documentOrder.indexOf(filePath);
    newActive = newOrder[oldIndex] ?? newOrder[oldIndex - 1] ?? null;
  }

  app.documents = newDocs;
  app.documentOrder = newOrder;
  app.activeDocumentPath = newActive;
}

export function setActiveDocument(filePath: string): void {
  if (app.documents.has(filePath)) {
    app.activeDocumentPath = filePath;
  }
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

export function setComments(comments: Comment[], filePath?: string): void {
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

export function setScrollY(y: number, filePath?: string): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({ scrollY: y }));
}

export function setReanchorTarget(
  target: { commentId: string } | null,
  filePath?: string,
): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({ reanchorTarget: target }));
}

export function updateDocumentHtml(html: string, filePath?: string): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, (s) => ({
    document: { ...s.document, html },
  }));
}

export function setHeadings(headings: Heading[], filePath?: string): void {
  const path = resolveFilePath(filePath);
  if (!path) return;
  updateDocState(path, () => ({ headings }));
}

export function hydrateFromInlineData(data: InlineData): void {
  app.workingDirectory = data.workingDirectory;

  const newDocs = new Map<string, DocumentState>();
  const order: string[] = [];

  // Read HTML from the server-rendered article if not in inline data
  // (avoids duplicating the full document HTML in the JSON payload)
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
