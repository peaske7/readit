import { beforeEach, describe, expect, it } from "vitest";
import type { Comment, Document } from "../types";
import { createAppStore } from "./index";

const mockDoc: Document = {
  content: "# Hello",
  type: "markdown",
  filePath: "/test/file.md",
  fileName: "file.md",
  clean: false,
};

const mockDoc2: Document = {
  content: "<h1>Hello</h1>",
  type: "html",
  filePath: "/test/file.html",
  fileName: "file.html",
  clean: false,
};

const mockComment = {
  id: "c1",
  selectedText: "hello",
  comment: "note",
  startOffset: 0,
  endOffset: 5,
  createdAt: "2026-03-13T00:00:00Z",
} as Comment;

describe("AppStore", () => {
  let store: ReturnType<typeof createAppStore>;

  beforeEach(() => {
    store = createAppStore();
  });

  describe("openDocument", () => {
    it("adds document to store and sets as active", () => {
      store.getState().openDocument(mockDoc);
      const state = store.getState();
      expect(state.documents.has("/test/file.md")).toBe(true);
      expect(state.activeDocumentPath).toBe("/test/file.md");
      expect(state.documentOrder).toEqual(["/test/file.md"]);
    });

    it("does not overwrite existing document state", () => {
      store.getState().openDocument(mockDoc);
      store.getState().setComments([mockComment]);
      store.getState().openDocument(mockDoc);
      expect(
        store.getState().documents.get("/test/file.md")!.comments,
      ).toHaveLength(1);
    });

    it("activates existing document without overwriting", () => {
      store.getState().openDocument(mockDoc);
      store.getState().openDocument(mockDoc2);
      expect(store.getState().activeDocumentPath).toBe("/test/file.html");
      store.getState().openDocument(mockDoc);
      expect(store.getState().activeDocumentPath).toBe("/test/file.md");
      // Order unchanged
      expect(store.getState().documentOrder).toEqual([
        "/test/file.md",
        "/test/file.html",
      ]);
    });
  });

  describe("closeDocument", () => {
    it("removes document and activates right neighbor", () => {
      store.getState().openDocument(mockDoc);
      store.getState().openDocument(mockDoc2);
      store.getState().setActiveDocument("/test/file.md");
      store.getState().closeDocument("/test/file.md");
      expect(store.getState().documents.has("/test/file.md")).toBe(false);
      expect(store.getState().activeDocumentPath).toBe("/test/file.html");
    });

    it("activates left neighbor when closing last in order", () => {
      store.getState().openDocument(mockDoc);
      store.getState().openDocument(mockDoc2);
      // mockDoc2 is active (last opened)
      store.getState().closeDocument("/test/file.html");
      expect(store.getState().activeDocumentPath).toBe("/test/file.md");
    });

    it("sets null when closing last document", () => {
      store.getState().openDocument(mockDoc);
      store.getState().closeDocument("/test/file.md");
      expect(store.getState().activeDocumentPath).toBeNull();
      expect(store.getState().documentOrder).toEqual([]);
    });

    it("does not change active if closing non-active tab", () => {
      store.getState().openDocument(mockDoc);
      store.getState().openDocument(mockDoc2);
      // mockDoc2 is active
      store.getState().closeDocument("/test/file.md");
      expect(store.getState().activeDocumentPath).toBe("/test/file.html");
    });

    it("activates right neighbor when closing middle tab", () => {
      const mockDoc3: Document = {
        content: "# Third",
        type: "markdown",
        filePath: "/test/third.md",
        fileName: "third.md",
        clean: false,
      };
      store.getState().openDocument(mockDoc);
      store.getState().openDocument(mockDoc2);
      store.getState().openDocument(mockDoc3);
      store.getState().setActiveDocument("/test/file.html");
      store.getState().closeDocument("/test/file.html");
      expect(store.getState().activeDocumentPath).toBe("/test/third.md");
      expect(store.getState().documentOrder).toEqual([
        "/test/file.md",
        "/test/third.md",
      ]);
    });
  });

  describe("setActiveDocument", () => {
    it("sets active document", () => {
      store.getState().openDocument(mockDoc);
      store.getState().openDocument(mockDoc2);
      store.getState().setActiveDocument("/test/file.md");
      expect(store.getState().activeDocumentPath).toBe("/test/file.md");
    });

    it("ignores unknown file paths", () => {
      store.getState().openDocument(mockDoc);
      store.getState().setActiveDocument("/nonexistent.md");
      expect(store.getState().activeDocumentPath).toBe("/test/file.md");
    });
  });

  describe("per-document setters default to active doc", () => {
    it("setComments operates on active document", () => {
      store.getState().openDocument(mockDoc);
      store.getState().setComments([mockComment]);
      const docState = store.getState().documents.get("/test/file.md")!;
      expect(docState.comments).toEqual([mockComment]);
      expect(docState.sortedComments).toEqual([mockComment]);
    });

    it("setComments with explicit filePath targets that document", () => {
      store.getState().openDocument(mockDoc);
      store.getState().openDocument(mockDoc2);
      store.getState().setComments([mockComment], "/test/file.html");
      expect(
        store.getState().documents.get("/test/file.html")!.comments,
      ).toEqual([mockComment]);
      expect(store.getState().documents.get("/test/file.md")!.comments).toEqual(
        [],
      );
    });

    it("sortedComments sorts by startOffset", () => {
      store.getState().openDocument(mockDoc);
      const c1 = { ...mockComment, id: "c1", startOffset: 10 };
      const c2 = { ...mockComment, id: "c2", startOffset: 2 };
      const c3 = { ...mockComment, id: "c3", startOffset: 5 };
      store.getState().setComments([c1, c2, c3]);
      const docState = store.getState().documents.get("/test/file.md")!;
      expect(docState.sortedComments.map((c) => c.id)).toEqual([
        "c2",
        "c3",
        "c1",
      ]);
    });

    it("setSelection operates on active document", () => {
      store.getState().openDocument(mockDoc);
      const sel = { text: "hello", startOffset: 0, endOffset: 5 };
      store.getState().setSelection(sel);
      expect(
        store.getState().documents.get("/test/file.md")!.selection,
      ).toEqual(sel);
    });

    it("setScrollY operates on active document", () => {
      store.getState().openDocument(mockDoc);
      store.getState().setScrollY(150);
      expect(store.getState().documents.get("/test/file.md")!.scrollY).toBe(
        150,
      );
    });

    it("setters no-op when no active document", () => {
      // No document opened
      store.getState().setComments([mockComment]);
      // Should not throw, just no-op
      expect(store.getState().documents.size).toBe(0);
    });
  });

  describe("getActiveDocumentState", () => {
    it("returns undefined when no active document", () => {
      expect(store.getState().getActiveDocumentState()).toBeUndefined();
    });

    it("returns active document state", () => {
      store.getState().openDocument(mockDoc);
      const state = store.getState().getActiveDocumentState();
      expect(state).toBeDefined();
      expect(state!.document.filePath).toBe("/test/file.md");
    });
  });

  describe("updateDocumentContent", () => {
    it("updates document content in place", () => {
      store.getState().openDocument(mockDoc);
      store.getState().updateDocumentContent("# Updated");
      expect(
        store.getState().documents.get("/test/file.md")!.document.content,
      ).toBe("# Updated");
    });
  });
});
