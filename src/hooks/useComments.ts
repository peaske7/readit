import { useCallback, useEffect, useRef } from "react";
import { AnchorConfidences, type Comment } from "../schema";
import { appStore, useAppStore } from "../store";

interface UseCommentsOptions {
  clean?: boolean;
}

interface UseCommentsResult {
  comments: Comment[];
  error?: string;
  addComment: (
    selectedText: string,
    comment: string,
    startOffset: number,
    endOffset: number,
  ) => void;
  deleteComment: (id: string) => void;
  deleteAll: () => void;
  editComment: (id: string, newText: string) => void;
  reanchorComment: (
    id: string,
    selectedText: string,
    startOffset: number,
    endOffset: number,
  ) => void;
}

export function useComments(
  filePath: string | null,
  options: UseCommentsOptions = {},
): UseCommentsResult {
  const { clean = false } = options;

  const comments = useAppStore(
    (s) => s.documents.get(filePath ?? "")?.comments ?? [],
  );
  const error = useAppStore(
    (s) => s.documents.get(filePath ?? "")?.commentsError ?? undefined,
  );

  const pendingOperations = useRef<Map<string, Comment[]>>(new Map());

  // Capture filePath at call time so callbacks stay stable across renders
  const filePathRef = useRef(filePath);
  filePathRef.current = filePath;

  const executeMutation = useCallback(
    async <T>({
      operationId,
      optimisticUpdate,
      apiCall,
      onSuccess,
      errorMessage,
    }: {
      operationId: string;
      optimisticUpdate: (prev: Comment[]) => Comment[];
      apiCall: () => Promise<T>;
      onSuccess?: (result: T, prev: Comment[]) => Comment[];
      errorMessage: string;
    }) => {
      const fp = filePathRef.current;
      if (!fp) return;

      const currentDocState = appStore.getState().documents.get(fp);
      const previousComments = [...(currentDocState?.comments ?? [])];
      pendingOperations.current.set(operationId, previousComments);

      appStore.getState().setComments(optimisticUpdate(previousComments), fp);
      appStore.getState().setCommentsError(null, fp);

      try {
        const result = await apiCall();

        if (onSuccess) {
          const current = appStore.getState().documents.get(fp)?.comments ?? [];
          appStore.getState().setComments(onSuccess(result, current), fp);
        }
      } catch (err) {
        console.error(`${errorMessage}:`, err);
        appStore
          .getState()
          .setCommentsError(
            err instanceof Error ? err.message : errorMessage,
            fp,
          );

        const rollback = pendingOperations.current.get(operationId);
        if (rollback) {
          appStore.getState().setComments(rollback, fp);
        }
      } finally {
        pendingOperations.current.delete(operationId);
      }
    },
    [],
  );

  const pathQuery = useCallback((base: string) => {
    const fp = filePathRef.current;
    if (!fp) return base;
    return `${base}?path=${encodeURIComponent(fp)}`;
  }, []);

  useEffect(() => {
    if (!filePath) return;

    const loadComments = async () => {
      appStore.getState().setCommentsError(null, filePath);
      const query = `?path=${encodeURIComponent(filePath)}`;

      try {
        if (clean) {
          await fetch(`/api/comments${query}`, { method: "DELETE" });
          appStore.getState().setComments([], filePath);
          return;
        }

        const response = await fetch(`/api/comments${query}`);
        if (!response.ok) {
          throw new Error(`Failed to load comments: ${response.statusText}`);
        }

        const data = await response.json();
        appStore.getState().setComments(data.comments || [], filePath);
      } catch (err) {
        console.error("Failed to load comments:", err);
        appStore
          .getState()
          .setCommentsError(
            err instanceof Error ? err.message : "Failed to load comments",
            filePath,
          );
        appStore.getState().setComments([], filePath);
      }
    };

    loadComments();
  }, [filePath, clean]);

  const addComment = useCallback(
    (
      selectedText: string,
      commentText: string,
      startOffset: number,
      endOffset: number,
    ) => {
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimisticComment: Comment = {
        id: tempId,
        selectedText,
        comment: commentText.trim(),
        createdAt: new Date().toISOString(),
        startOffset,
        endOffset,
      };

      executeMutation({
        operationId: tempId,
        optimisticUpdate: (prev) => [...prev, optimisticComment],
        apiCall: async () => {
          const response = await fetch(pathQuery("/api/comments"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              selectedText,
              comment: commentText.trim(),
              startOffset,
              endOffset,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to add comment: ${response.statusText}`);
          }

          return response.json();
        },
        onSuccess: (data, prev) =>
          prev.map((c) => (c.id === tempId ? data.comment : c)),
        errorMessage: "Failed to add comment",
      });
    },
    [executeMutation, pathQuery],
  );

  const deleteComment = useCallback(
    (id: string) => {
      executeMutation({
        operationId: `delete-${id}`,
        optimisticUpdate: (prev) => prev.filter((c) => c.id !== id),
        apiCall: async () => {
          const response = await fetch(pathQuery(`/api/comments/${id}`), {
            method: "DELETE",
          });

          if (!response.ok) {
            throw new Error(`Failed to delete comment: ${response.statusText}`);
          }
        },
        errorMessage: "Failed to delete comment",
      });
    },
    [executeMutation, pathQuery],
  );

  const deleteAll = useCallback(() => {
    executeMutation({
      operationId: "delete-all",
      optimisticUpdate: () => [],
      apiCall: async () => {
        const response = await fetch(pathQuery("/api/comments"), {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(
            `Failed to delete all comments: ${response.statusText}`,
          );
        }
      },
      errorMessage: "Failed to delete all comments",
    });
  }, [executeMutation, pathQuery]);

  const editComment = useCallback(
    (id: string, newText: string) => {
      const trimmed = newText.trim();
      if (!trimmed) return;

      executeMutation({
        operationId: `edit-${id}`,
        optimisticUpdate: (prev) =>
          prev.map((c) => (c.id === id ? { ...c, comment: trimmed } : c)),
        apiCall: async () => {
          const response = await fetch(pathQuery(`/api/comments/${id}`), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ comment: trimmed }),
          });

          if (!response.ok) {
            throw new Error(`Failed to update comment: ${response.statusText}`);
          }
        },
        errorMessage: "Failed to edit comment",
      });
    },
    [executeMutation, pathQuery],
  );

  const reanchorComment = useCallback(
    (
      id: string,
      selectedText: string,
      startOffset: number,
      endOffset: number,
    ) => {
      executeMutation({
        operationId: `reanchor-${id}`,
        optimisticUpdate: (prev) =>
          prev.map((c) =>
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
        apiCall: async () => {
          const response = await fetch(
            pathQuery(`/api/comments/${id}/reanchor`),
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ selectedText, startOffset, endOffset }),
            },
          );

          if (!response.ok) {
            throw new Error(
              `Failed to re-anchor comment: ${response.statusText}`,
            );
          }

          return response.json();
        },
        onSuccess: (data, prev) =>
          prev.map((c) => (c.id === id ? data.comment : c)),
        errorMessage: "Failed to re-anchor comment",
      });
    },
    [executeMutation, pathQuery],
  );

  return {
    comments,
    error,
    addComment,
    deleteComment,
    deleteAll,
    editComment,
    reanchorComment,
  };
}
