<script lang="ts">
import { onDestroy, onMount, untrack } from "svelte";
import CommentErrorBanner from "./components/CommentErrorBanner.svelte";
import CommentInput from "./components/CommentInput.svelte";
import CommentNav from "./components/CommentNav.svelte";
import CommentPopover from "./components/CommentPopover.svelte";
import DocumentViewer from "./components/DocumentViewer.svelte";
import FloatingComment from "./components/FloatingComment.svelte";
import Header from "./components/Header.svelte";
import MarginNotesContainer from "./components/MarginNotesContainer.svelte";
import ReanchorConfirm from "./components/ReanchorConfirm.svelte";
import TabBar from "./components/TabBar.svelte";
import TableOfContents from "./components/TableOfContents.svelte";
import Toast from "./components/Toast.svelte";
import type { Cluster } from "./lib/clustering";
import { extractContext, formatForLLM } from "./lib/context";
import {
  exportCommentsAsJson,
  formatComment,
  generatePrompt,
} from "./lib/export";
import { fetchOrThrow } from "./lib/fetch-or-throw";
import { Positions } from "./lib/positions";
import { matchesBinding, ShortcutActions } from "./lib/shortcut-registry";
import { AnchorConfidences, type Comment } from "./schema";
import {
  app,
  getActiveDocumentState,
  openDocument,
  setActiveDocument,
  setComments,
  setCommentsError,
  setHeadings,
  setPendingSelectionTop,
  setReanchorTarget,
  setScrollY,
  setSelection,
  setWorkingDirectory,
  updateDocumentHtml,
} from "./stores/app.svelte";
import { t } from "./stores/locale.svelte";
import { initSettings } from "./stores/settings.svelte";
import { initShortcuts, shortcutState } from "./stores/shortcuts.svelte";
import { showToast } from "./stores/toast.svelte";
import { setActiveCommentId, ui } from "./stores/ui.svelte";

let isInitialized = $state(false);
let error = $state<string | null>(null);
const positionsMap = new Map<string, Positions>();
let activeClusters = $state<Cluster[]>([]);
let activeIndexById = $state<Map<string, number>>(new Map());
let currentIndex = $state(0);
const highlighterMap = new Map<
  string,
  {
    setFocused: (id: string | undefined) => void;
    scrollTo: (id: string) => void;
  }
>();
const prevActiveMap = new Map<string, boolean>();

function clearPendingHighlight() {
  if (typeof CSS !== "undefined" && CSS.highlights) {
    CSS.highlights.delete("pending-selection");
  }
}

function getPositions(filePath: string): Positions {
  let pos = positionsMap.get(filePath);
  if (!pos) {
    pos = new Positions();
    positionsMap.set(filePath, pos);
  }
  return pos;
}

// Tracks the last successful task PATCH per file so we can ignore the
// matching SSE round-trip — the optimistic DOM update is already correct,
// and a full innerHTML swap would clobber it (visible as a "revert" flicker).
const recentTaskPatches = new Map<string, number>();
const TASK_PATCH_SSE_DEBOUNCE_MS = 800;

async function toggleTask(
  filePath: string,
  index: number,
  checked: boolean,
): Promise<boolean> {
  try {
    const res = await fetch("/api/document/task", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath, index, checked }),
    });
    if (res.ok) {
      recentTaskPatches.set(filePath, Date.now());
    }
    return res.ok;
  } catch (err) {
    console.error("Failed to toggle task:", err);
    return false;
  }
}

async function addComment(
  filePath: string,
  selectedText: string,
  commentText: string,
  startOffset: number,
  endOffset: number,
) {
  const tempId = `temp-${crypto.randomUUID()}`;
  const optimisticComment: Comment = {
    id: tempId,
    selectedText,
    comment: commentText.trim(),
    startOffset,
    endOffset,
  };

  const docState = app.documents.get(filePath);
  const previousComments = [...(docState?.comments ?? [])];

  setComments([...previousComments, optimisticComment], filePath);
  setCommentsError(null, filePath);

  try {
    const response = await fetchOrThrow(
      `/api/comments?path=${encodeURIComponent(filePath)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedText,
          comment: commentText.trim(),
          startOffset,
          endOffset,
        }),
      },
      "Failed to add comment",
    );
    const data = await response.json();
    const current = app.documents.get(filePath)?.comments ?? [];
    setComments(
      current.map((c) => (c.id === tempId ? data.comment : c)),
      filePath,
    );
  } catch (err) {
    console.error("Failed to add comment:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to add comment",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

async function editComment(filePath: string, id: string, newText: string) {
  const trimmed = newText.trim();
  if (!trimmed) return;

  const docState = app.documents.get(filePath);
  const previousComments = [...(docState?.comments ?? [])];

  setComments(
    previousComments.map((c) => (c.id === id ? { ...c, comment: trimmed } : c)),
    filePath,
  );

  setCommentsError(null, filePath);
  try {
    await fetchOrThrow(
      `/api/comments/${id}?path=${encodeURIComponent(filePath)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: trimmed }),
      },
      "Failed to update comment",
    );
  } catch (err) {
    console.error("Failed to edit comment:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to update comment",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

async function deleteComment(filePath: string, id: string) {
  const docState = app.documents.get(filePath);
  const previousComments = [...(docState?.comments ?? [])];

  setComments(
    previousComments.filter((c) => c.id !== id),
    filePath,
  );

  setCommentsError(null, filePath);
  try {
    await fetchOrThrow(
      `/api/comments/${id}?path=${encodeURIComponent(filePath)}`,
      { method: "DELETE" },
      "Failed to delete comment",
    );
  } catch (err) {
    console.error("Failed to delete comment:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to delete comment",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

async function deleteAllComments(filePath: string) {
  const docState = app.documents.get(filePath);
  const previousComments = [...(docState?.comments ?? [])];

  setComments([], filePath);

  setCommentsError(null, filePath);
  try {
    await fetchOrThrow(
      `/api/comments?path=${encodeURIComponent(filePath)}`,
      { method: "DELETE" },
      "Failed to delete all comments",
    );
  } catch (err) {
    console.error("Failed to delete all comments:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to delete all comments",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

async function reanchorComment(
  filePath: string,
  id: string,
  selectedText: string,
  startOffset: number,
  endOffset: number,
) {
  const docState = app.documents.get(filePath);
  const previousComments = [...(docState?.comments ?? [])];

  setComments(
    previousComments.map((c) =>
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
    filePath,
  );

  setCommentsError(null, filePath);
  try {
    const response = await fetchOrThrow(
      `/api/comments/${id}/reanchor?path=${encodeURIComponent(filePath)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedText, startOffset, endOffset }),
      },
      "Failed to re-anchor comment",
    );
    const data = await response.json();
    const current = app.documents.get(filePath)?.comments ?? [];
    setComments(
      current.map((c) => (c.id === id ? data.comment : c)),
      filePath,
    );
  } catch (err) {
    console.error("Failed to re-anchor comment:", err);
    setCommentsError(
      err instanceof Error ? err.message : "Failed to re-anchor comment",
      filePath,
    );
    setComments(previousComments, filePath);
  }
}

function registerHighlighter(
  filePath: string,
  focused: (id: string | undefined) => void,
  scrollTo: (id: string) => void,
) {
  highlighterMap.set(filePath, { setFocused: focused, scrollTo });
}

function unregisterHighlighter(filePath: string) {
  highlighterMap.delete(filePath);
}

function navigateToComment(commentId: string) {
  const active = app.activeDocumentPath;
  const entry = active ? highlighterMap.get(active) : undefined;
  entry?.scrollTo(commentId);
  entry?.setFocused(commentId);
  setActiveCommentId(commentId);
}

function handleClustersChanged(
  filePath: string,
  clusters: Cluster[],
  indexById: Map<string, number>,
) {
  if (filePath !== app.activeDocumentPath) return;
  activeClusters = clusters;
  activeIndexById = indexById;
}

function navigatePrevious(sortedComments: Comment[]) {
  if (sortedComments.length === 0) return;
  currentIndex =
    currentIndex === 0 ? sortedComments.length - 1 : currentIndex - 1;
  navigateToComment(sortedComments[currentIndex].id);
}

function navigateNext(sortedComments: Comment[]) {
  if (sortedComments.length === 0) return;
  currentIndex =
    currentIndex === sortedComments.length - 1 ? 0 : currentIndex + 1;
  navigateToComment(sortedComments[currentIndex].id);
}

function copyComment(comment: Comment) {
  navigator.clipboard.writeText(formatComment(comment));
  showToast(t("toast.copiedComment"));
}

function onTextSelect(
  filePath: string,
  text: string,
  startOffset: number,
  endOffset: number,
  selectionTop: number,
) {
  setActiveCommentId(undefined);
  setSelection({ text, startOffset, endOffset }, filePath);
  setPendingSelectionTop(selectionTop, filePath);
  const pos = positionsMap.get(filePath);
  pos?.setPending(selectionTop);
}

function clearSelection(filePath: string) {
  setSelection(null, filePath);
  setPendingSelectionTop(undefined, filePath);
  positionsMap.get(filePath)?.setPending(undefined);
  clearPendingHighlight();
  window.getSelection()?.removeAllRanges();
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.closest("[data-comment-input]")) return;

  if (!app.activeDocumentPath) return;
  const docState = app.documents.get(app.activeDocumentPath);
  if (!docState?.selection) return;

  setSelection(null, app.activeDocumentPath);
  setPendingSelectionTop(undefined, app.activeDocumentPath);
  positionsMap.get(app.activeDocumentPath)?.setPending(undefined);
  clearPendingHighlight();
  requestAnimationFrame(() => {
    const sel = window.getSelection();
    if (sel?.isCollapsed) {
      sel.removeAllRanges();
    }
  });
}

function handleCopyAll(filePath: string) {
  const docState = app.documents.get(filePath);
  if (!docState) return;
  navigator.clipboard.writeText(
    generatePrompt(docState.comments, docState.document.fileName),
  );
  showToast(t("toast.copiedAllComments"));
}

function handleExportJson(filePath: string) {
  const docState = app.documents.get(filePath);
  if (!docState) return;
  exportCommentsAsJson(docState.comments, docState.document);
}

function handleAddComment(filePath: string, commentText: string) {
  const docState = app.documents.get(filePath);
  if (!docState?.selection) return;
  const { text, startOffset, endOffset } = docState.selection;
  addComment(filePath, text, commentText, startOffset, endOffset);
  clearSelection(filePath);
}

function handleConfirmReanchor(filePath: string) {
  const docState = app.documents.get(filePath);
  if (!docState?.selection || !docState.reanchorTarget) return;
  const { text, startOffset, endOffset } = docState.selection;
  reanchorComment(
    filePath,
    docState.reanchorTarget.commentId,
    text,
    startOffset,
    endOffset,
  );
  setReanchorTarget(null, filePath);
  clearSelection(filePath);
}

function handleCancelReanchor(filePath: string) {
  setReanchorTarget(null, filePath);
  clearSelection(filePath);
}

function handleHighlightClick(commentId: string) {
  setActiveCommentId(commentId);
}

function scrollToHeading(id: string) {
  const rect = document.getElementById(id)?.getBoundingClientRect();
  if (!rect) return;
  const elementTop = window.scrollY + rect.top;
  const scrollTarget = Math.max(0, elementTop - window.innerHeight * 0.25);
  window.scrollTo({ top: scrollTarget, behavior: "smooth" });
}

function startReanchor(filePath: string, commentId: string) {
  setReanchorTarget({ commentId }, filePath);
}

let heartbeatSource: EventSource | undefined;
let documentStreamSource: EventSource | undefined;

async function initialize() {
  // If already hydrated by main.ts from inline data, skip
  if (app.documentOrder.length > 0) {
    isInitialized = true;
    return;
  }

  // Fallback: fetch from API (e.g. if inline data was missing)
  try {
    const res = await fetch("/api/documents");
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();

    const clean = data.clean || false;
    if (data.workingDirectory) setWorkingDirectory(data.workingDirectory);

    for (const file of data.files) {
      openDocument(
        { html: "", filePath: file.path, fileName: file.fileName, clean },
        { active: false },
      );
    }

    if (data.files.length > 0) {
      setActiveDocument(data.files[0].path);
    }

    initSettings();
    initShortcuts(data.settings?.keybindings ?? []);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load documents";
  } finally {
    isInitialized = true;
  }
}

function setupDocumentStream() {
  let reconnectDelay = 1000;
  const MAX_RECONNECT_DELAY = 30000;

  function connect() {
    documentStreamSource = new EventSource("/api/document/stream");

    documentStreamSource.onopen = () => {
      reconnectDelay = 1000; // Reset on successful connection
    };

    documentStreamSource.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "document-added" && data.path) {
          openDocument(
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
          const path = data.path;
          const state = app.documents.get(path);
          if (!state?.document.html) return;

          // Skip if we just initiated a task PATCH — the optimistic update is
          // authoritative for our own click; refetching would flicker.
          const lastPatch = recentTaskPatches.get(path);
          if (
            lastPatch !== undefined &&
            Date.now() - lastPatch < TASK_PATCH_SSE_DEBOUNCE_MS
          ) {
            recentTaskPatches.delete(path);
            return;
          }

          // Fetch updated document and comments in parallel
          const [docRes, commentsRes] = await Promise.all([
            fetch(`/api/document?path=${encodeURIComponent(path)}`),
            fetch(`/api/comments?path=${encodeURIComponent(path)}`),
          ]);

          if (docRes.ok) {
            const doc = await docRes.json();
            setHeadings(doc.headings ?? [], path);
            updateDocumentHtml(doc.html, path);
          }
          if (commentsRes.ok) {
            const commentsData = await commentsRes.json();
            setComments(commentsData.comments ?? [], path);
          }
        }
      } catch (err) {
        // SSE message parse failure — non-critical, stream will continue
        console.warn("Failed to parse document stream message:", err);
      }
    };

    documentStreamSource.onerror = () => {
      documentStreamSource?.close();
      // Auto-reconnect with exponential backoff
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
        connect();
      }, reconnectDelay);
    };
  }

  connect();
}

$effect(() => {
  const path = app.activeDocumentPath;
  if (!path) return;
  const state = app.documents.get(path);
  if (!state || state.document.html) return;

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
      setComments(comments as Comment[], path);
      setHeadings(docData.headings ?? [], path);
      updateDocumentHtml(docData.html, path);
    },
    (err) => {
      error = err instanceof Error ? err.message : "Failed to load document";
    },
  );
});

async function reload() {
  const path = app.activeDocumentPath;
  if (!path) return;
  try {
    const res = await fetch(`/api/document?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    setHeadings(data.headings ?? [], path);
    updateDocumentHtml(data.html, path);

    // Also refresh comments
    const commentsRes = await fetch(
      `/api/comments?path=${encodeURIComponent(path)}`,
    );
    if (commentsRes.ok) {
      const commentsData = await commentsRes.json();
      setComments(commentsData.comments ?? [], path);
    }
  } catch (err) {
    console.error("Failed to reload:", err);
  }
}

function handleKeyDown(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  const tagName = target.tagName;

  if (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    target.isContentEditable
  ) {
    return;
  }

  if (event.metaKey) {
    const digit = Number.parseInt(event.key, 10);
    if (digit >= 1 && digit <= 9) {
      if (app.documentOrder.length <= 1) return;
      const targetIndex = Math.min(digit - 1, app.documentOrder.length - 1);
      const targetPath = app.documentOrder[targetIndex];
      if (targetPath) {
        event.preventDefault();
        setActiveDocument(targetPath);
      }
      return;
    }
  }

  const filePath = app.activeDocumentPath;
  if (!filePath) return;

  const docState = app.documents.get(filePath);
  if (!docState) return;

  for (const shortcut of shortcutState.shortcuts) {
    if (!shortcut.enabled) continue;
    if (!matchesBinding(event, shortcut.binding)) continue;

    event.preventDefault();

    switch (shortcut.id) {
      case ShortcutActions.COPY_ALL:
        handleCopyAll(filePath);
        break;
      case ShortcutActions.COPY_ALL_RAW:
        navigator.clipboard.writeText(
          docState.comments.map(formatComment).join("\n\n---\n\n"),
        );
        showToast(t("toast.copiedAllComments"));
        break;
      case ShortcutActions.NAVIGATE_NEXT:
        navigateNext(docState.sortedComments);
        break;
      case ShortcutActions.NAVIGATE_PREVIOUS:
        navigatePrevious(docState.sortedComments);
        break;
      case ShortcutActions.COPY_SELECTION_RAW: {
        const sel = window.getSelection()?.toString();
        if (sel) navigator.clipboard.writeText(sel);
        break;
      }
      case ShortcutActions.COPY_SELECTION_LLM: {
        const sel = docState.selection;
        if (sel) {
          const context = extractContext({
            content: docState.document.html,
            startOffset: sel.startOffset,
            endOffset: sel.endOffset,
          });
          navigator.clipboard.writeText(
            formatForLLM({
              context,
              fileName: docState.document.fileName,
            }),
          );
        }
        break;
      }
      case ShortcutActions.CLEAR_SELECTION:
        clearSelection(filePath);
        break;
    }

    return;
  }
}

$effect(() => {
  for (const filePath of app.documentOrder) {
    const isActive = filePath === app.activeDocumentPath;
    const wasActive = prevActiveMap.get(filePath) ?? false;

    if (wasActive && !isActive) {
      untrack(() => setScrollY(window.scrollY, filePath));
    }

    if (!wasActive && isActive) {
      const savedY = app.documents.get(filePath)?.scrollY ?? 0;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, savedY);
        });
      });
    }

    prevActiveMap.set(filePath, isActive);
  }
});

$effect(() => {
  const docState = getActiveDocumentState();
  if (!docState) return;
  const max = docState.sortedComments.length - 1;
  if (max >= 0 && untrack(() => currentIndex) > max) {
    currentIndex = max;
  }
});

onMount(() => {
  initialize();

  heartbeatSource = new EventSource("/api/heartbeat");
  setupDocumentStream();

  window.addEventListener("keydown", handleKeyDown);
  document.addEventListener("mousedown", handleClickOutside);
});

onDestroy(() => {
  heartbeatSource?.close();
  documentStreamSource?.close();
  window.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("mousedown", handleClickOutside);

  for (const pos of positionsMap.values()) {
    pos.dispose();
  }
});
</script>

{#if error}
  <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
    <div class="text-red-600">{error}</div>
  </div>
{:else if !isInitialized}
  <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
    <div class="text-zinc-500 dark:text-zinc-400">
      {t("app.loading")}
    </div>
  </div>
{:else if app.documentOrder.length === 0}
  <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col">
    <TabBar />
    <div class="flex-1 flex flex-col items-center justify-center gap-3">
      <p class="text-zinc-400 dark:text-zinc-500 text-sm">
        {t("app.noDocuments")}
      </p>
      <p class="text-zinc-400 dark:text-zinc-500 text-xs">
        {t("app.noDocumentsHintPrefix")}
        {#if t("app.noDocumentsHintPrefix")}{" "}{/if}
        <code class="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
          readit open &lt;file.md&gt;
        </code>
        {" "}
        {t("app.noDocumentsHintSuffix")}
      </p>
    </div>
  </div>
{:else}
  <TabBar />

  {#each app.documentOrder as filePath (filePath)}
    {@const docState = app.documents.get(filePath)}
    {@const isActive = filePath === app.activeDocumentPath}
    {@const hasContent = !!docState?.document.html}

    {#if hasContent || isActive}
      <div style={isActive ? undefined : "display: none"}>
        {#if !hasContent}
          <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex items-center justify-center">
            <div class="text-zinc-500 dark:text-zinc-400">
              {t("app.loading")}
            </div>
          </div>
        {:else if docState}
          {@const headings = docState.headings}
          {@const comments = docState.comments}
          {@const sortedComments = docState.sortedComments}
          {@const selection = docState.selection}
          {@const pendingSelectionTop = docState.pendingSelectionTop}
          {@const reanchorTarget = docState.reanchorTarget}

          <div class="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 flex flex-col">
            <Header
              fileName={docState.document.fileName}
              {comments}
              hasReanchorTarget={reanchorTarget !== null}
              oncopyall={() => handleCopyAll(filePath)}
              onexportjson={() => handleExportJson(filePath)}
              onreload={reload}
              onedit={(id, text) => editComment(filePath, id, text)}
              ondelete={(id) => deleteComment(filePath, id)}
              ondeleteall={() => deleteAllComments(filePath)}
              oncopy={copyComment}
              onnavigate={navigateToComment}
              onstartreanchor={(id) => startReanchor(filePath, id)}
            />

            <CommentErrorBanner
              error={docState.commentsError}
              ondismiss={() => setCommentsError(null, filePath)}
            />

            <div class="flex-1 flex items-start gap-4 w-full max-w-7xl mx-auto overflow-x-clip">
              {#if headings.length > 0}
                <aside class="w-48 flex-shrink-0 py-6 pl-6 hidden xl:block">
                  <div class="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
                    <TableOfContents
                      {headings}
                      onheadingclick={scrollToHeading}
                    />
                  </div>
                </aside>
              {/if}

              <div class="flex-1 px-6 py-6">
                <DocumentViewer
                  content={docState.document.html}
                  {comments}
                  {isActive}
                  onTextSelect={(text, start, end, top) => onTextSelect(filePath, text, start, end, top)}
                  onHighlightClick={handleHighlightClick}
                  onTaskToggle={(index, checked) => toggleTask(filePath, index, checked)}
                  onClustersChanged={(clusters, indexById) => handleClustersChanged(filePath, clusters, indexById)}
                  registerHighlighter={(focused, scrollTo) => registerHighlighter(filePath, focused, scrollTo)}
                  unregisterHighlighter={() => unregisterHighlighter(filePath)}
                  positions={getPositions(filePath)}
                />
              </div>

              <div data-margin-column class="w-72 flex-shrink-0 py-6 pr-4 relative hidden lg:block">
                {#if selection && pendingSelectionTop !== undefined}
                  <div
                    class="absolute left-0 right-0 z-10 bg-white dark:bg-zinc-900"
                    style="top: {pendingSelectionTop}px"
                  >
                    {#if reanchorTarget !== null}
                      <ReanchorConfirm
                        selectionText={selection.text}
                        onconfirm={() => handleConfirmReanchor(filePath)}
                        oncancel={() => handleCancelReanchor(filePath)}
                      />
                    {:else}
                      <CommentInput
                        selectedText={selection.text}
                        onsubmit={(text) => handleAddComment(filePath, text)}
                        oncancel={() => clearSelection(filePath)}
                      />
                    {/if}
                  </div>
                {/if}

                <MarginNotesContainer
                  clusters={isActive ? activeClusters : []}
                  positions={getPositions(filePath)}
                />
              </div>
            </div>

            {#if ui.activeCommentId && isActive}
              {@const activeComment = comments.find((c) => c.id === ui.activeCommentId)}
              {@const idx = activeIndexById.get(ui.activeCommentId) ?? 0}
              {#if activeComment}
                <CommentPopover
                  comment={activeComment}
                  index={idx}
                  onedit={(id, text) => editComment(filePath, id, text)}
                  ondelete={(id) => deleteComment(filePath, id)}
                  oncopy={copyComment}
                />
              {/if}
            {/if}

            <!-- Floating comment input for narrow viewports (below lg) -->
            {#if selection && pendingSelectionTop !== undefined}
              <div class="fixed bottom-16 left-4 right-4 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-4 lg:hidden">
                {#if reanchorTarget !== null}
                  <ReanchorConfirm
                    selectionText={selection.text}
                    onconfirm={() => handleConfirmReanchor(filePath)}
                    oncancel={() => handleCancelReanchor(filePath)}
                  />
                {:else}
                  <CommentInput
                    selectedText={selection.text}
                    onsubmit={(text) => handleAddComment(filePath, text)}
                    oncancel={() => clearSelection(filePath)}
                  />
                {/if}
              </div>
            {/if}

            <!-- Floating comment viewer for narrow viewports (click highlight to show) -->
            {#if ui.activeCommentId}
              {@const activeComment = comments.find((c) => c.id === ui.activeCommentId)}
              {#if activeComment}
                <FloatingComment
                  comment={activeComment}
                  onedit={(id, text) => editComment(filePath, id, text)}
                  ondelete={(id) => deleteComment(filePath, id)}
                  oncopy={copyComment}
                  onnavigate={navigateToComment}
                />
              {/if}
            {/if}

            <CommentNav
              {sortedComments}
              {currentIndex}
              onprevious={() => navigatePrevious(sortedComments)}
              onnext={() => navigateNext(sortedComments)}
            />

            <footer class="py-4 text-center text-sm text-zinc-400 dark:text-zinc-500">
              {t("app.footer")}
            </footer>
          </div>
        {/if}
      </div>
    {/if}
  {/each}
{/if}

<Toast />

