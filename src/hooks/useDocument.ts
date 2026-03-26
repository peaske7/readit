import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { appStore, useAppStore } from "../store";
import type { Document } from "../types";

interface UseDocumentResult {
  document: Document | null;
  error: string | null;
  isInitialized: boolean;
  reload: () => Promise<void>;
}

interface DocListItem {
  path: string;
  fileName: string;
}

/**
 * Manage multi-document loading, lazy content fetching, and live reloading.
 *
 * On mount: fetches the document list from `/api/documents` and opens all
 * files in the store. Content is loaded lazily when a tab becomes active.
 * SSE events trigger content updates for already-loaded documents.
 */
export function useDocument(): UseDocumentResult {
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const activeDocumentPath = useAppStore((s) => s.activeDocumentPath);

  // Active document — null until content is loaded
  const document = useAppStore((s) => {
    const ds = s.getActiveDocumentState();
    if (!ds?.document.content) return null;
    return ds.document;
  });

  // Fetch document list on mount, populate store
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/documents");
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();

        const clean = data.clean || false;
        if (data.workingDirectory) {
          appStore.getState().setWorkingDirectory(data.workingDirectory);
        }
        data.files.forEach((file: DocListItem, index: number) => {
          appStore.getState().openDocument(
            {
              content: "", // Content loaded lazily on tab activation
              filePath: file.path,
              fileName: file.fileName,
              clean,
            },
            { active: index === 0 },
          );
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load documents",
        );
      } finally {
        setIsInitialized(true);
      }
    }
    init();
  }, []);

  // Load content when active document changes and has no content yet
  useEffect(() => {
    if (!activeDocumentPath) return;
    const state = appStore.getState().documents.get(activeDocumentPath);
    if (!state || state.document.content) return;

    async function loadContent() {
      try {
        const res = await fetch(
          `/api/document?path=${encodeURIComponent(activeDocumentPath!)}`,
        );
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        appStore
          .getState()
          .updateDocumentContent(data.content, activeDocumentPath!);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load document",
        );
      }
    }
    loadContent();
  }, [activeDocumentPath]);

  // SSE: register new documents without stealing focus; reload loaded docs on updates
  useEffect(() => {
    const eventSource = new EventSource("/api/document/stream");
    eventSource.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "document-added" && data.path) {
          appStore.getState().openDocument(
            {
              content: "", // Lazy-loaded when tab activated
              filePath: data.path,
              fileName: data.fileName,
              clean: false,
            },
            { active: false },
          );
          return;
        }
        if (data.type === "document-updated" && data.path) {
          // Only reload if content was previously loaded
          const state = appStore.getState().documents.get(data.path);
          if (!state?.document.content) return;

          const res = await fetch(
            `/api/document?path=${encodeURIComponent(data.path)}`,
          );
          if (res.ok) {
            const doc = await res.json();
            appStore.getState().updateDocumentContent(doc.content, data.path);
          }
        }
      } catch {
        // Ignore non-JSON messages ("connected", "ping")
      }
    };
    return () => eventSource.close();
  }, []);

  const reload = useCallback(async () => {
    if (!activeDocumentPath) return;
    try {
      const res = await fetch(
        `/api/document?path=${encodeURIComponent(activeDocumentPath)}`,
      );
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      appStore
        .getState()
        .updateDocumentContent(data.content, activeDocumentPath);
      toast.success("Document reloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reload");
    }
  }, [activeDocumentPath]);

  return { document, error, isInitialized, reload };
}
