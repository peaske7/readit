import { use, useCallback, useEffect, useRef } from "react";
import { Toaster } from "sonner";
import { CommentInput } from "./components/comments/CommentInput";
import { CommentMinimap } from "./components/comments/CommentMinimap";
import { CommentNav } from "./components/comments/CommentNav";
import { DocumentViewer } from "./components/DocumentViewer";
import { FloatingTOC } from "./components/FloatingTOC";
import { Header } from "./components/Header";
import { MarginNotes } from "./components/MarginNotes";
import { ReanchorConfirm } from "./components/ReanchorConfirm";
import { TabBar } from "./components/TabBar";
import { TableOfContents } from "./components/TableOfContents";
import { textVariants } from "./components/ui/Text";
import { CommentContext, CommentProvider } from "./contexts/CommentContext";
import { LayoutContext, LayoutProvider } from "./contexts/LayoutContext";
import { useLocale } from "./contexts/LocaleContext";
import { useClipboard } from "./hooks/useClipboard";
import { useDocument } from "./hooks/useDocument";
import { useHeadings } from "./hooks/useHeadings";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useScrollMetrics } from "./hooks/useScrollMetrics";
import { useScrollSpy } from "./hooks/useScrollSpy";
import { useTextSelection } from "./hooks/useTextSelection";
import { calculateScrollTarget, getElementTopInDocument } from "./lib/scroll";
import { ShortcutActions } from "./lib/shortcut-registry";
import { cn } from "./lib/utils";
import { appStore, useAppStore } from "./store";

const TOASTER_ICONS = { success: null, error: null, info: null, warning: null };
const TOASTER_OPTIONS = {
  unstyled: true,
  duration: 2000,
  classNames: {
    toast: cn(
      "backdrop-blur-sm bg-white/90 dark:bg-zinc-900/90 border border-zinc-100 dark:border-zinc-800 px-3 py-2 shadow-sm rounded-md",
      textVariants({ variant: "caption" }),
    ),
  },
};

interface AppContentProps {
  document: NonNullable<ReturnType<typeof useDocument>["document"]>;
  reload: ReturnType<typeof useDocument>["reload"];
}

function AppContent({ document, reload }: AppContentProps) {
  const { t } = useLocale();
  const {
    comments,
    sortedComments,
    addComment,
    reanchorComment,
    reanchorTarget,
    cancelReanchor,
    hoveredCommentId,
    setHoveredCommentId,
    navigatePrevious,
    navigateNext,
  } = use(CommentContext)!;

  const {
    selection,
    highlightPositions,
    documentPositions,
    pendingSelectionTop,
    onTextSelect,
    onPositionsChange,
    clearSelection,
  } = useTextSelection();

  const {
    copyAll,
    copyAllRaw,
    exportJson,
    copySelectionRaw,
    copySelectionForLLM,
  } = useClipboard({
    comments,
    document: document ?? undefined,
    selection: selection ?? undefined,
    clearSelection,
    t,
  });

  const { shortcuts, isFullscreen } = use(LayoutContext)!;

  useKeyboardShortcuts(shortcuts, {
    [ShortcutActions.COPY_ALL]: copyAll,
    [ShortcutActions.COPY_ALL_RAW]: copyAllRaw,
    [ShortcutActions.NAVIGATE_NEXT]: navigateNext,
    [ShortcutActions.NAVIGATE_PREVIOUS]: navigatePrevious,
    [ShortcutActions.COPY_SELECTION_RAW]: copySelectionRaw,
    [ShortcutActions.COPY_SELECTION_LLM]: copySelectionForLLM,
    [ShortcutActions.CLEAR_SELECTION]: clearSelection,
  });

  const scrollMetrics = useScrollMetrics();

  const headings = useHeadings(
    document?.content ?? null,
    document?.type ?? null,
  );
  const activeHeadingId = useScrollSpy(headings.map((h) => h.id));

  const scrollToHeading = useCallback(
    (id: string) => {
      let elementRect: DOMRect | undefined;
      let iframeTopOffset: number | undefined;

      if (document?.type === "html") {
        const iframe = window.document.querySelector("iframe");
        const el = iframe?.contentDocument?.getElementById(id);
        if (!el || !iframe) return;
        elementRect = el.getBoundingClientRect();
        iframeTopOffset = iframe.getBoundingClientRect().top;
      } else {
        elementRect = window.document
          .getElementById(id)
          ?.getBoundingClientRect();
      }
      if (!elementRect) return;

      const elementTop = getElementTopInDocument({
        elementRect,
        scrollY: window.scrollY,
        iframeTopOffset,
      });
      const scrollTarget = calculateScrollTarget({
        elementTop,
        viewportHeight: window.innerHeight,
      });
      window.scrollTo({ top: scrollTarget, behavior: "smooth" });
    },
    [document?.type],
  );

  const handleHighlightClick = useCallback((commentId: string) => {
    const marginNote = window.document.querySelector(
      `article[data-comment-id="${commentId}"]`,
    );
    if (marginNote) {
      marginNote.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // Scroll save/restore for tab switching
  const setScrollY = useAppStore((s) => s.setScrollY);
  const savedScrollY = useAppStore(
    (s) => s.getActiveDocumentState()?.scrollY ?? 0,
  );
  const scrollRestored = useRef(false);

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      setScrollY(window.scrollY);
    };
  }, [setScrollY]);

  // Restore scroll position on mount (after highlights paint)
  useEffect(() => {
    if (savedScrollY === 0 || scrollRestored.current) return;
    scrollRestored.current = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollY);
      });
    });
  }, [savedScrollY]);

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
      <Toaster
        position="bottom-right"
        icons={TOASTER_ICONS}
        toastOptions={TOASTER_OPTIONS}
      />
      <Header
        fileName={document.fileName}
        onCopyAll={copyAll}
        onCopyAllRaw={copyAllRaw}
        onExportJson={exportJson}
        onReload={reload}
      />

      <div
        className={`flex-1 flex gap-4 w-full ${!isFullscreen ? "max-w-7xl mx-auto" : ""} ${hoveredCommentId ? "has-comment-focus" : ""}`}
      >
        {!isFullscreen && headings.length > 0 && (
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
        {isFullscreen && (
          <FloatingTOC
            headings={headings}
            activeId={activeHeadingId}
            onHeadingClick={scrollToHeading}
          />
        )}

        <div className="flex-1 px-6 py-6">
          <DocumentViewer
            content={document.content}
            type={document.type}
            comments={comments}
            headings={headings}
            pendingSelection={selection ?? undefined}
            onTextSelect={onTextSelect}
            onHighlightPositionsChange={onPositionsChange}
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
                  onCopyRaw={copySelectionRaw}
                  onCopyForLLM={copySelectionForLLM}
                />
              )}
            </div>
          )}

          <MarginNotes
            sortedComments={sortedComments}
            highlightPositions={highlightPositions}
            pendingSelectionTop={selection ? pendingSelectionTop : undefined}
          />
        </div>
      </div>

      <CommentMinimap
        documentPositions={documentPositions}
        documentHeight={scrollMetrics.documentHeight}
        viewportHeight={scrollMetrics.viewportHeight}
      />

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

      // Cmd+1-9: switch to tab by index
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
  const { document, error, isInitialized, reload } = useDocument();
  const documentOrder = useAppStore((s) => s.documentOrder);

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

  if (!document) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-500 dark:text-zinc-400">
          {t("app.loading")}
        </div>
      </div>
    );
  }

  return (
    <>
      <TabBar />
      <LayoutProvider>
        <CommentProvider
          filePath={document.filePath}
          clean={document.clean}
          documentContent={document.content}
          fileName={document.fileName}
          documentType={document.type}
        >
          <AppContent document={document} reload={reload} />
        </CommentProvider>
      </LayoutProvider>
    </>
  );
}

export default App;
