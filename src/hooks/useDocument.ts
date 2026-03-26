import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Document } from "../schema";
import { appStore, useAppStore } from "../store";

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

export function useDocument(): UseDocumentResult {
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const activeDocumentPath = useAppStore((s) => s.activeDocumentPath);

  const document = useAppStore((s) => {
    const ds = s.getActiveDocumentState();
    if (!ds?.document.html) return null;
    return ds.document;
  });

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
              html: "",
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

  useEffect(() => {
    if (!activeDocumentPath) return;
    const state = appStore.getState().documents.get(activeDocumentPath);
    if (!state || state.document.html) return;

    const path = activeDocumentPath;
    const query = `?path=${encodeURIComponent(path)}`;
    const isClean = state.document.clean;

    const docFetch = fetch(`/api/document${query}`).then((r) => {
      if (!r.ok) throw new Error(`Server error: ${r.status}`);
      return r.json();
    });

    const commentsFetch = isClean
      ? fetch(`/api/comments${query}`, { method: "DELETE" }).then(
          () => [] as unknown[],
        )
      : fetch(`/api/comments${query}`)
          .then((r) => (r.ok ? r.json() : { comments: [] }))
          .then((d) => d.comments || []);

    Promise.all([docFetch, commentsFetch]).then(
      ([docData, comments]) => {
        appStore.getState().setComments(comments, path);
        appStore.getState().setHeadings(docData.headings ?? [], path);
        appStore.getState().updateDocumentHtml(docData.html, path);
      },
      (err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load document",
        );
      },
    );
  }, [activeDocumentPath]);

  useEffect(() => {
    const eventSource = new EventSource("/api/document/stream");
    eventSource.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "document-added" && data.path) {
          appStore.getState().openDocument(
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
          const state = appStore.getState().documents.get(data.path);
          if (!state?.document.html) return;

          const res = await fetch(
            `/api/document?path=${encodeURIComponent(data.path)}`,
          );
          if (res.ok) {
            const doc = await res.json();
            appStore.getState().setHeadings(doc.headings ?? [], data.path);
            appStore.getState().updateDocumentHtml(doc.html, data.path);
          }
        }
      } catch {}
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
      appStore.getState().setHeadings(data.headings ?? [], activeDocumentPath);
      appStore.getState().updateDocumentHtml(data.html, activeDocumentPath);
      toast.success("Document reloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reload");
    }
  }, [activeDocumentPath]);

  return { document, error, isInitialized, reload };
}
