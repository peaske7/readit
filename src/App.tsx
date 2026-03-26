import { useCallback, useEffect, useMemo, useRef } from "react";
import { Toaster, toast } from "sonner";
import { CommentInput } from "./components/comments/CommentInput";
import { CommentNav } from "./components/comments/CommentNav";
import { DocumentViewer } from "./components/DocumentViewer/DocumentViewer";
import { Header } from "./components/Header";
import { MarginNotes } from "./components/MarginNotes";
import { ReanchorConfirm } from "./components/ReanchorConfirm";
import { TabBar } from "./components/TabBar";
import { TableOfContents } from "./components/TableOfContents";
import {
  CommentProvider,
  useCommentActions,
  useCommentData,
} from "./contexts/CommentContext";
import { useLocale } from "./contexts/LocaleContext";
import { PositionsProvider, usePositions } from "./contexts/PositionsContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { useDocument } from "./hooks/useDocument";
import { useScrollSpy } from "./hooks/useScrollSpy";
import { useTextSelection } from "./hooks/useTextSelection";
import { exportCommentsAsJson, generatePrompt } from "./lib/export";
import type { Heading } from "./lib/headings";
import { cn } from "./lib/utils";
import { appStore, useAppStore } from "./store";

const TOASTER_ICONS = { success: null, error: null, info: null, warning: null };
const TOASTER_OPTIONS = {
  unstyled: true,
  duration: 2000,
  classNames: {
    toast: cn(
      "backdrop-blur-sm bg-white/90 dark:bg-zinc-900/90 border border-zinc-100 dark:border-zinc-800 px-3 py-2 shadow-sm rounded-md",
      "text-xs text-zinc-500 dark:text-zinc-400",
    ),
  },
};

interface AppContentProps {
  document: NonNullable<ReturnType<typeof useDocument>["document"]>;
  reload: ReturnType<typeof useDocument>["reload"];
  isActive: boolean;
}

function AppContent({ document, reload, isActive }: AppContentProps) {
  const { t } = useLocale();
  const { comments, sortedComments, reanchorTarget } = useCommentData();
  const { addComment, reanchorComment, cancelReanchor, setHoveredCommentId } =
    useCommentActions();

  const { selection, pendingSelectionTop, onTextSelect, clearSelection } =
    useTextSelection();

  const pos = usePositions();

  useEffect(() => {
    pos.setIds(sortedComments.map((c) => c.id));
  }, [pos, sortedComments]);
  useEffect(() => {
    pos.setPending(selection ? pendingSelectionTop : undefined);
  }, [pos, selection, pendingSelectionTop]);

  const copyAll = useCallback(() => {
    if (!document) return;
    navigator.clipboard.writeText(generatePrompt(comments, document.fileName));
    toast.success(t("toast.copiedAllComments"));
  }, [comments, document, t]);

  const exportJson = useCallback(() => {
    if (!document) return;
    exportCommentsAsJson(comments, document);
  }, [comments, document]);

  const headings = useAppStore(
    (s) => s.documents.get(document.filePath)?.headings ?? ([] as Heading[]),
  );
  const headingIds = useMemo(() => headings.map((h) => h.id), [headings]);
  const activeHeadingId = useScrollSpy(headingIds, isActive);

  const scrollToHeading = useCallback((id: string) => {
    const rect = window.document.getElementById(id)?.getBoundingClientRect();
    if (!rect) return;

    const elementTop = window.scrollY + rect.top;
    const scrollTarget = Math.max(0, elementTop - window.innerHeight * 0.25);
    window.scrollTo({ top: scrollTarget, behavior: "smooth" });
  }, []);

  const handleHighlightClick = useCallback((commentId: string) => {
    const marginNote = window.document.querySelector(
      `article[data-comment-id="${commentId}"]`,
    );
    if (marginNote) {
      marginNote.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const setScrollY = useAppStore((s) => s.setScrollY);
  const savedScrollY = useAppStore(
    (s) => s.documents.get(document.filePath)?.scrollY ?? 0,
  );
  const prevActiveRef = useRef(isActive);

  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;

    if (wasActive && !isActive) {
      setScrollY(window.scrollY, document.filePath);
    }

    if (!wasActive && isActive) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, savedScrollY);
        });
      });
    }
  }, [isActive, savedScrollY, setScrollY, document.filePath]);

  const handleAddComment = useCallback(
    (commentText: string) => {
      if (!selection) return;

      addComment(
        selection.text,
        commentText,
        selection.startOffset,
        selection.endOffset,
      );

      clearSelection();
    },
    [selection, addComment, clearSelection],
  );

  const handleConfirmReanchor = useCallback(() => {
    if (!selection || !reanchorTarget) return;

    reanchorComment(
      reanchorTarget.commentId,
      selection.text,
      selection.startOffset,
      selection.endOffset,
    );

    cancelReanchor();
    clearSelection();
  }, [
    selection,
    reanchorTarget,
    reanchorComment,
    cancelReanchor,
    clearSelection,
  ]);

  const handleCancelReanchor = useCallback(() => {
    cancelReanchor();
    clearSelection();
  }, [cancelReanchor, clearSelection]);

  if (!document) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col">
      <Header
        fileName={document.fileName}
        onCopyAll={copyAll}
        onExportJson={exportJson}
        onReload={reload}
      />

      <div className="flex-1 flex gap-4 w-full max-w-7xl mx-auto">
        {headings.length > 0 && (
          <aside className="w-48 flex-shrink-0 py-6 pl-6 hidden xl:block">
            <div className="sticky top-64 max-h-[calc(100vh-17rem)] overflow-y-auto">
              <TableOfContents
                headings={headings}
                activeId={activeHeadingId}
                onHeadingClick={scrollToHeading}
              />
            </div>
          </aside>
        )}

        <div className="flex-1 px-6 py-6">
          <DocumentViewer
            content={document.html}
            comments={comments}
            isActive={isActive}
            onTextSelect={onTextSelect}
            onHighlightHover={setHoveredCommentId}
            onHighlightClick={handleHighlightClick}
          />
        </div>

        <div className="w-72 flex-shrink-0 py-6 pr-4 relative">
          {selection && pendingSelectionTop !== undefined && (
            <div
              className="absolute left-0 right-0 z-10 bg-white dark:bg-zinc-900"
              style={{ top: pendingSelectionTop }}
            >
              {reanchorTarget !== null ? (
                <ReanchorConfirm
                  selectionText={selection.text}
                  onConfirm={handleConfirmReanchor}
                  onCancel={handleCancelReanchor}
                />
              ) : (
                <CommentInput
                  key={selection.text}
                  selectedText={selection.text}
                  onSubmit={handleAddComment}
                  onCancel={clearSelection}
                />
              )}
            </div>
          )}

          <MarginNotes sortedComments={sortedComments} />
        </div>
      </div>

      <CommentNav />

      <footer className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">
        {t("app.footer")}
      </footer>
    </div>
  );
}

function useTabKeyboardShortcuts() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey) return;

      const digit = Number.parseInt(event.key, 10);
      if (digit >= 1 && digit <= 9) {
        const { documentOrder } = appStore.getState();
        if (documentOrder.length <= 1) return;
        const targetIndex = Math.min(digit - 1, documentOrder.length - 1);
        const targetPath = documentOrder[targetIndex];
        if (targetPath) {
          event.preventDefault();
          appStore.getState().setActiveDocument(targetPath);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}

function App() {
  const { t } = useLocale();
  const { error, isInitialized, reload } = useDocument();
  const documentOrder = useAppStore((s) => s.documentOrder);
  const activeDocumentPath = useAppStore((s) => s.activeDocumentPath);
  const documents = useAppStore((s) => s.documents);

  useTabKeyboardShortcuts();

  useEffect(() => {
    const eventSource = new EventSource("/api/heartbeat");
    return () => eventSource.close();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500 dark:text-zinc-400">
          {t("app.loading")}
        </div>
      </div>
    );
  }

  if (documentOrder.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col">
        <TabBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="text-zinc-400 dark:text-zinc-500 text-sm">
            {t("app.noDocuments")}
          </p>
          <p className="text-zinc-400 dark:text-zinc-500 text-xs">
            {t("app.noDocumentsHintPrefix")}
            {t("app.noDocumentsHintPrefix") && " "}
            <code className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
              readit open &lt;file.md&gt;
            </code>{" "}
            {t("app.noDocumentsHintSuffix")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <TabBar />
      <Toaster
        position="bottom-right"
        icons={TOASTER_ICONS}
        toastOptions={TOASTER_OPTIONS}
      />
      <SettingsProvider>
        {documentOrder.map((filePath) => {
          const docState = documents.get(filePath);
          const isActive = filePath === activeDocumentPath;
          const hasContent = !!docState?.document.html;

          if (!hasContent && !isActive) return null;

          if (!hasContent) {
            return (
              <div
                key={filePath}
                className="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center"
              >
                <div className="text-zinc-500 dark:text-zinc-400">
                  {t("app.loading")}
                </div>
              </div>
            );
          }

          return (
            <div
              key={filePath}
              style={isActive ? undefined : { display: "none" }}
            >
              <PositionsProvider>
                <CommentProvider
                  filePath={filePath}
                  clean={docState.document.clean}
                >
                  <AppContent
                    document={docState.document}
                    reload={reload}
                    isActive={isActive}
                  />
                </CommentProvider>
              </PositionsProvider>
            </div>
          );
        })}
      </SettingsProvider>
    </>
  );
}

export default App;
