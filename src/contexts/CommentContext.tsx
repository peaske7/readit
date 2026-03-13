import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { toast } from "sonner";
import { useCommentNavigation } from "../hooks/useCommentNavigation";
import { useComments } from "../hooks/useComments";
import { useReanchorMode } from "../hooks/useReanchorMode";
import { extractContext, formatForLLM } from "../lib/context";
import { generatePrompt } from "../lib/export";
import { truncate } from "../lib/utils";
import { useAppStore } from "../store";
import type { Comment, DocumentType } from "../types";

interface CommentContextValue {
  // From useComments
  comments: Comment[];
  commentCount: number;
  addComment: (
    selectedText: string,
    comment: string,
    startOffset: number,
    endOffset: number,
  ) => void;
  editComment: (id: string, newText: string) => void;
  deleteComment: (id: string) => void;
  deleteAll: () => void;
  reanchorComment: (
    id: string,
    selectedText: string,
    startOffset: number,
    endOffset: number,
  ) => void;
  // Derived
  sortedComments: Comment[];
  // From useCommentNavigation
  currentIndex: number;
  hoveredCommentId: string | undefined;
  setHoveredCommentId: (id: string | undefined) => void;
  navigateToComment: (commentId: string) => void;
  navigatePrevious: () => void;
  navigateNext: () => void;
  // From useReanchorMode
  reanchorTarget: { commentId: string } | null;
  startReanchor: (commentId: string) => void;
  cancelReanchor: () => void;
  // Copy operations
  copyCommentRaw: (comment: Comment) => void;
  copyCommentForLLM: (comment: Comment) => void;
  copyAllForLLM: () => void;
  // Scroll to highlight
  scrollToHighlight: (commentId: string) => void;
}

export const CommentContext = createContext<CommentContextValue | null>(null);

export function useCommentContext(): CommentContextValue {
  const value = use(CommentContext);
  if (!value) {
    throw new Error("useCommentContext must be used within a CommentProvider");
  }
  return value;
}

interface CommentProviderProps {
  filePath: string;
  clean: boolean;
  documentContent: string;
  fileName: string;
  documentType: DocumentType;
  children: ReactNode;
}

export function CommentProvider({
  filePath,
  clean,
  documentContent,
  fileName,
  documentType,
  children,
}: CommentProviderProps) {
  const {
    comments,
    error: commentsError,
    addComment,
    deleteComment,
    deleteAll,
    editComment,
    reanchorComment,
  } = useComments(filePath, { clean });

  // sortedComments from store (already sorted by setComments)
  const sortedComments = useAppStore(
    (s) => s.documents.get(filePath)?.sortedComments ?? [],
  );

  const {
    currentIndex,
    hoveredCommentId,
    setHoveredCommentId,
    navigateToComment,
    navigatePrevious,
    navigateNext,
  } = useCommentNavigation(sortedComments);

  const { reanchorTarget, startReanchor, cancelReanchor } = useReanchorMode();

  // Show comments errors as toast
  useEffect(() => {
    if (commentsError) {
      toast.error(commentsError);
    }
  }, [commentsError]);

  const copyCommentRaw = useCallback((comment: Comment) => {
    const raw = `${comment.selectedText}\n\n${comment.comment}`;
    navigator.clipboard.writeText(raw);
    toast.success(`Copied: "${truncate(comment.comment)}"`);
  }, []);

  const copyCommentForLLM = useCallback(
    (comment: Comment) => {
      const context = extractContext({
        content: documentContent,
        startOffset: comment.startOffset,
        endOffset: comment.endOffset,
      });
      const formatted = formatForLLM({
        context,
        fileName,
        comment: comment.comment,
      });

      navigator.clipboard.writeText(formatted);
      toast.success(`Copied for LLM: "${truncate(comment.comment)}"`);
    },
    [documentContent, fileName],
  );

  const copyAllForLLM = useCallback(() => {
    const prompt = generatePrompt(comments, fileName);
    navigator.clipboard.writeText(prompt);
    toast.success("Copied all comments");
  }, [comments, fileName]);

  const scrollToHighlight = useCallback(
    (commentId: string) => {
      if (documentType === "html") {
        const iframe = window.document.querySelector("iframe");
        iframe?.contentWindow?.postMessage(
          { type: "scrollToHighlight", commentId },
          "*",
        );
      } else {
        const mark = window.document.querySelector(
          `mark[data-comment-id="${commentId}"]`,
        );
        if (mark) {
          mark.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    },
    [documentType],
  );

  const commentCount = comments.length;

  const value = useMemo<CommentContextValue>(
    () => ({
      comments,
      commentCount,
      addComment,
      editComment,
      deleteComment,
      deleteAll,
      reanchorComment,
      sortedComments,
      currentIndex,
      hoveredCommentId,
      setHoveredCommentId,
      navigateToComment,
      navigatePrevious,
      navigateNext,
      reanchorTarget,
      startReanchor,
      cancelReanchor,
      copyCommentRaw,
      copyCommentForLLM,
      copyAllForLLM,
      scrollToHighlight,
    }),
    [
      comments,
      commentCount,
      addComment,
      editComment,
      deleteComment,
      deleteAll,
      reanchorComment,
      sortedComments,
      currentIndex,
      hoveredCommentId,
      setHoveredCommentId,
      navigateToComment,
      navigatePrevious,
      navigateNext,
      reanchorTarget,
      startReanchor,
      cancelReanchor,
      copyCommentRaw,
      copyCommentForLLM,
      copyAllForLLM,
      scrollToHighlight,
    ],
  );

  return <CommentContext value={value}>{children}</CommentContext>;
}
