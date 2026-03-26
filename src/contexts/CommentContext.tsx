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
import { formatComment } from "../lib/export";
import { truncate } from "../lib/utils";
import type { Comment } from "../schema";
import { appStore, useAppStore } from "../store";
import { useLocale } from "./LocaleContext";

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
  copyComment: (comment: Comment) => void;
  registerHighlighter: (
    setFocused: (id: string | undefined) => void,
    scrollToComment: (id: string) => void,
  ) => void;
}

const CommentActionsContext = createContext<CommentActionsValue | null>(null);

export function useCommentActions(): CommentActionsValue {
  const value = use(CommentActionsContext);
  if (!value) {
    throw new Error("useCommentActions must be used within a CommentProvider");
  }
  return value;
}

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

export type CommentContextValue = CommentActionsValue & CommentDataValue;

export function useCommentContext(): CommentContextValue {
  return { ...useCommentActions(), ...useCommentData() };
}

interface CommentProviderProps {
  filePath: string;
  clean: boolean;
  children: ReactNode;
}

export function CommentProvider({
  filePath,
  clean,
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
    registerHighlighter,
  } = useCommentNavigation(sortedComments);

  const reanchorTarget = useAppStore(
    (s) => s.getActiveDocumentState()?.reanchorTarget ?? null,
  );
  const startReanchor = useCallback((commentId: string) => {
    appStore.getState().setReanchorTarget({ commentId });
  }, []);
  const cancelReanchor = useCallback(() => {
    appStore.getState().setReanchorTarget(null);
  }, []);
  const { t } = useLocale();

  useEffect(() => {
    if (commentsError) {
      toast.error(commentsError);
    }
  }, [commentsError]);

  const copyComment = useCallback(
    (comment: Comment) => {
      navigator.clipboard.writeText(formatComment(comment));
      toast.success(t("toast.copied", { text: truncate(comment.comment) }));
    },
    [t],
  );

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
      copyComment,
      registerHighlighter,
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
      copyComment,
      registerHighlighter,
    ],
  );

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
