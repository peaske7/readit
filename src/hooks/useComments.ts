import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment } from "../types";

interface UseCommentsOptions {
  clean?: boolean;
}

interface UseCommentsResult {
  comments: Comment[];
  isLoading: boolean;
  error?: string;
  addComment: (
    selectedText: string,
    comment: string,
    startOffset: number,
    endOffset: number,
  ) => void;
  deleteComment: (id: string) => void;
  editComment: (id: string, newText: string) => void;
}

/**
 * Hook for managing comments with optimistic updates.
 * Comments are persisted to markdown files via the server API.
 */
export function useComments(
  filePath: string | null,
  options: UseCommentsOptions = {},
): UseCommentsResult {
  const { clean = false } = options;

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  // Track pending operations for rollback on error
  const pendingOperations = useRef<Map<string, Comment[]>>(new Map());

  /**
   * Execute an optimistic mutation with automatic rollback on error.
   *
   * Pattern:
   * 1. Save current state for rollback
   * 2. Apply optimistic update immediately
   * 3. Execute API call
   * 4. On success: optionally transform state with server response
   * 5. On error: rollback to previous state
   * 6. Cleanup pending operation tracking
   */
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
      // Save previous state for rollback
      const previousComments = [...comments];
      pendingOperations.current.set(operationId, previousComments);

      // Apply optimistic update
      setComments(optimisticUpdate);
      setError(undefined);

      try {
        const result = await apiCall();

        // Apply server response transformation if provided
        if (onSuccess) {
          setComments((prev) => onSuccess(result, prev));
        }
      } catch (err) {
        console.error(`${errorMessage}:`, err);
        setError(err instanceof Error ? err.message : errorMessage);

        // Rollback on error
        const rollback = pendingOperations.current.get(operationId);
        if (rollback) {
          setComments(rollback);
        }
      } finally {
        pendingOperations.current.delete(operationId);
      }
    },
    [comments],
  );

  // Load comments from API
  useEffect(() => {
    if (!filePath) {
      setIsLoading(false);
      return;
    }

    const loadComments = async () => {
      setIsLoading(true);
      setError(undefined);

      try {
        // If clean flag is set, clear comments first
        if (clean) {
          await fetch("/api/comments", { method: "DELETE" });
          setComments([]);
          setIsLoading(false);
          return;
        }

        const response = await fetch("/api/comments");
        if (!response.ok) {
          throw new Error(`Failed to load comments: ${response.statusText}`);
        }

        const data = await response.json();
        setComments(data.comments || []);
      } catch (err) {
        console.error("Failed to load comments:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load comments",
        );
        setComments([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadComments();
  }, [filePath, clean]);

  /**
   * Add a new comment with optimistic update.
   */
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
          const response = await fetch("/api/comments", {
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
    [executeMutation],
  );

  /**
   * Delete a comment with optimistic update.
   */
  const deleteComment = useCallback(
    (id: string) => {
      executeMutation({
        operationId: `delete-${id}`,
        optimisticUpdate: (prev) => prev.filter((c) => c.id !== id),
        apiCall: async () => {
          const response = await fetch(`/api/comments/${id}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            throw new Error(`Failed to delete comment: ${response.statusText}`);
          }
        },
        errorMessage: "Failed to delete comment",
      });
    },
    [executeMutation],
  );

  /**
   * Edit a comment with optimistic update.
   */
  const editComment = useCallback(
    (id: string, newText: string) => {
      const trimmed = newText.trim();
      if (!trimmed) return;

      executeMutation({
        operationId: `edit-${id}`,
        optimisticUpdate: (prev) =>
          prev.map((c) => (c.id === id ? { ...c, comment: trimmed } : c)),
        apiCall: async () => {
          const response = await fetch(`/api/comments/${id}`, {
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
    [executeMutation],
  );

  return {
    comments,
    isLoading,
    error,
    addComment,
    deleteComment,
    editComment,
  };
}
