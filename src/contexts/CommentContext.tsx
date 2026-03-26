import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
import { useLocale } from "./LocaleContext";

// ─── Actions Context (stable callbacks — never causes re-renders) ───

interface CommentActionsValue {
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
  setHoveredCommentId: (id: string | undefined) => void;
  navigateToComment: (commentId: string) => void;
  navigatePrevious: () => void;
  navigateNext: () => void;
  startReanchor: (commentId: string) => void;
  cancelReanchor: () => void;
  copyCommentRaw: (comment: Comment) => void;
  copyCommentForLLM: (comment: Comment) => void;
  copyAllForLLM: () => void;
  scrollToHighlight: (commentId: string) => void;
}

const CommentActionsContext = createContext<CommentActionsValue | null>(null);

export function useCommentActions(): CommentActionsValue {
  const value = use(CommentActionsContext);
  if (!value) {
    throw new Error("useCommentActions must be used within a CommentProvider");
  }
  return value;
}

// ─── Data Context (volatile — re-renders consumers on change) ───────

interface CommentDataValue {
  comments: Comment[];
  commentCount: number;
  sortedComments: Comment[];
  currentIndex: number;
  reanchorTarget: { commentId: string } | null;
}

const CommentDataContext = createContext<CommentDataValue | null>(null);

export function useCommentData(): CommentDataValue {
  const value = use(CommentDataContext);
  if (!value) {
    throw new Error("useCommentData must be used within a CommentProvider");
  }
  return value;
}

// ─── Combined hook (backward compat — prefers split hooks) ──────────

export type CommentContextValue = CommentActionsValue & CommentDataValue;

/** @deprecated Use useCommentActions() or useCommentData() for better performance */
export function useCommentContext(): CommentContextValue {
  return { ...useCommentActions(), ...useCommentData() };
}

// Keep the old context export for App.tsx use() call
export const CommentContext = CommentDataContext;

// ─── Provider ───────────────────────────────────────────────────────

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

  const sortedComments = useAppStore(
    (s) => s.documents.get(filePath)?.sortedComments ?? [],
  );

  const {
    currentIndex,
    setHoveredCommentId,
    navigateToComment,
    navigatePrevious,
    navigateNext,
  } = useCommentNavigation(sortedComments);

  const { reanchorTarget, startReanchor, cancelReanchor } = useReanchorMode();
  const { t } = useLocale();

  useEffect(() => {
    if (commentsError) {
      toast.error(commentsError);
    }
  }, [commentsError]);

  const copyCommentRaw = useCallback(
    (comment: Comment) => {
      const line = comment.lineHint ? `[${comment.lineHint}] ` : "";
      const raw = `${line}${comment.selectedText}\n\n${comment.comment}`;
      navigator.clipboard.writeText(raw);
      toast.success(t("toast.copied", { text: truncate(comment.comment) }));
    },
    [t],
  );

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
      toast.success(
        t("toast.copiedForLLM", { text: truncate(comment.comment) }),
      );
    },
    [documentContent, fileName, t],
  );

  // Use ref so copyAllForLLM callback is stable (doesn't change when comments change)
  const commentsRef = useRef(comments);
  commentsRef.current = comments;

  const copyAllForLLM = useCallback(() => {
    const prompt = generatePrompt(commentsRef.current, fileName);
    navigator.clipboard.writeText(prompt);
    toast.success(t("toast.copiedAllComments"));
  }, [fileName, t]);

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

  // Actions value — stable (all callbacks are useCallback-wrapped)
  const actions = useMemo<CommentActionsValue>(
    () => ({
      addComment,
      editComment,
      deleteComment,
      deleteAll,
      reanchorComment,
      setHoveredCommentId,
      navigateToComment,
      navigatePrevious,
      navigateNext,
      startReanchor,
      cancelReanchor,
      copyCommentRaw,
      copyCommentForLLM,
      copyAllForLLM,
      scrollToHighlight,
    }),
    [
      addComment,
      editComment,
      deleteComment,
      deleteAll,
      reanchorComment,
      setHoveredCommentId,
      navigateToComment,
      navigatePrevious,
      navigateNext,
      startReanchor,
      cancelReanchor,
      copyCommentRaw,
      copyCommentForLLM,
      copyAllForLLM,
      scrollToHighlight,
    ],
  );

  // Data value — changes when comments/navigation/reanchor state changes
  const data = useMemo<CommentDataValue>(
    () => ({
      comments,
      commentCount: comments.length,
      sortedComments,
      currentIndex,
      reanchorTarget,
    }),
    [comments, sortedComments, currentIndex, reanchorTarget],
  );

  return (
    <CommentActionsContext value={actions}>
      <CommentDataContext value={data}>{children}</CommentDataContext>
    </CommentActionsContext>
  );
}
