import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { Document } from "../types";

interface UseDocumentResult {
  document: Document | null;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Manage document loading, error handling, and live reloading.
 * Subscribes to server-side file watcher for automatic updates.
 */
export function useDocument(): UseDocumentResult {
  const [document, setDocument] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load document on mount
  useEffect(() => {
    async function loadDocument() {
      try {
        const res = await fetch("/api/document");
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`);
        }
        const data = await res.json();
        setDocument(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load document",
        );
      }
    }
    loadDocument();
  }, []);

  // Reload document (manual or from file watcher)
  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/document");
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      setDocument(data);
      toast.success("Document reloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reload");
    }
  }, []);

  // Listen for document updates from file watcher
  useEffect(() => {
    const eventSource = new EventSource("/api/document/stream");
    eventSource.onmessage = (e) => {
      if (e.data === "update") {
        reload();
      }
    };
    return () => eventSource.close();
  }, [reload]);

  return { document, error, reload };
}
