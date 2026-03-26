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
    if (!ds?.document.content) return null;
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
              content: "",
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
    if (!state || state.document.content) return;

    const path = activeDocumentPath;
    const query = `?path=${encodeURIComponent(path)}`;
    const isClean = state.document.clean;

    // Fetch document content and comments in parallel so highlights
    // can apply immediately when CommentProvider mounts.
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
        // Set comments BEFORE content: content triggers CommentProvider mount,
        // so comments must already be in the store to avoid a wasted empty render.
        appStore.getState().setComments(comments, path);
        appStore.getState().updateDocumentContent(docData.content, path);
      },
      (err) => {
        setError(
          err instanceof Error ? err.message : "Failed to load document",
        );
      },
    );
  }, [activeDocumentPath]);

  // SSE: register new documents without stealing focus; reload already-loaded docs on updates
  useEffect(() => {
    const eventSource = new EventSource("/api/document/stream");
    eventSource.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "document-added" && data.path) {
          appStore.getState().openDocument(
            {
              content: "",
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
