# Multi-Document Support Design

**Date:** 2026-03-13
**Status:** Approved

## Overview

Evolve readit from single-document to multi-document support with tabbed navigation, full state preservation across tab switches, and Zustand for state management.

## Motivation

readit currently opens one file per session. Reviewers often need to cross-reference multiple documents — reviewing a spec alongside its implementation notes, or scanning an entire docs directory. Multi-document support makes readit useful for real review workflows.

## Invocation

```bash
npx readit file1.md file2.md           # Multiple files
npx readit ./docs/                      # Directory (all .md and .html files)
npx readit README.md ./docs/ notes.html # Mixed
npx readit file.md                      # Single file (unchanged)
```

## Interaction Model

- **Tabbed view** — one document visible at a time, tab bar to switch
- **Full state preservation** — selection, half-typed comments, scroll position all restored on tab switch
- **Lazy loading** — document content fetched on first tab activation, not all at once
- **Split view deferred** — tabs are the foundation; split view ships later

## Store Design (Zustand)

### Why Zustand

"Preserve everything on tab switch" means state must survive component unmounting. With tabs, only one document renders — inactive documents' React trees are gone. React Context dies with the tree. Zustand stores state outside React, solving this naturally.

### Shape

```ts
interface DocumentState {
  // Document data
  document: Document;

  // Comments
  comments: Comment[];
  commentsError: string | null;

  // Selection & input
  selection: SelectionRange | null;
  pendingSelectionTop: number | undefined;
  pendingCommentText: string;

  // Highlight positions (DOM-derived, recomputed on mount)
  highlightPositions: Record<string, number>;
  documentPositions: Record<string, number>;

  // Navigation
  scrollY: number;
  hoveredCommentId: string | undefined;

  // Re-anchor
  reanchorTarget: { commentId: string } | null;
}

interface AppStore {
  documents: Map<string, DocumentState>;
  activeDocumentPath: string | null;

  // Global actions
  openDocument: (doc: Document) => void;
  closeDocument: (filePath: string) => void;
  setActiveDocument: (filePath: string) => void;

  // Per-document actions (default to active document)
  addComment: (
    text: string,
    comment: string,
    start: number,
    end: number,
  ) => void;
  editComment: (id: string, newText: string) => void;
  deleteComment: (id: string) => void;
  setSelection: (selection: SelectionRange | null) => void;
  setHoveredComment: (id: string | undefined) => void;
  // ...
}
```

`highlightPositions` and `documentPositions` are DOM-derived — stale when unmounted, recomputed on mount. `scrollY` is the critical value to preserve; highlight positions are ephemeral.

Per-document actions take an optional `filePath` parameter but default to `activeDocumentPath`. This keeps call sites simple while enabling future split-view.

## Component Architecture

```
<App>                                    # Thin shell: store init, tab bar, active DocumentView
  +- <Toaster />
  +- <TabBar />                          # NEW - tab strip
  +- <Header />                          # Simplified - reads from store, ~8 props down from 14
  +- <DocumentView>                      # NEW - per-document layout
  |   +- <TableOfContents /> or <TOCPopover />   # Renamed from FloatingTOC
  |   +- <DocumentViewer />
  |   +- Margin area
  |   |   +- <ReanchorConfirmation />    # NEW - extracted from inline JSX
  |   |   +- <NewCommentForm />          # Renamed from CommentInputArea
  |   |   +- <MarginNotes />             # Renamed from MarginNotesContainer
  |   |       +- <MarginNote />          # Reads actions from store directly
  |   +- <CommentMinimap />
  |   +- <CommentNavigator />
  +- <footer />
```

### Component changes

- **App**: God component (~520 lines) becomes thin shell
- **DocumentView** (new): Owns per-document layout. On mount: restores scroll, re-applies highlights. On unmount: saves scrollY to store
- **MarginNote**: 6 callback props eliminated — calls `useAppStore()` directly
- **Header**: 14 props reduced to ~8 — reads comment data from store
- **CommentListDropdown** (renamed from CommentManagerDropdown): Reads from store directly
- **TabBar** (new): Renders open document tabs, close buttons, active indicator

## Server API Changes

| Endpoint              | Before                  | After                                      |
| --------------------- | ----------------------- | ------------------------------------------ |
| `GET /api/document`   | Returns single document | Requires `?path=` query param              |
| `GET /api/documents`  | (new)                   | Returns list of open file paths + metadata |
| `POST /api/documents` | (new, deferred)         | Add document at runtime (add-from-browser) |
| `GET /api/comments`   | Single file scoped      | Requires `?path=` query param              |
| `POST /api/comments`  | Single file scoped      | Requires `path` in body                    |

`GET /api/documents` returns only metadata (path, fileName, type) — lightweight enough to populate the tab bar immediately. Content loads lazily via `GET /api/document?path=`.

Comment storage unchanged — already per-file in `~/.readit/comments/`.

## Tab Switch Lifecycle

### Saving (unmount)

Most state is already in the store as it changes. The only explicit "save on unmount" is `scrollY`, since scroll isn't React-controlled.

### Restoring (mount)

1. Read document content from store (or fetch if first visit)
2. Highlighter applies marks, emits fresh highlightPositions
3. `window.scrollTo(0, scrollY)` after highlights are painted
4. If selection exists, highlight pending selection
5. If pendingCommentText, NewCommentForm renders pre-filled
6. If reanchorTarget, show re-anchor UI

Scroll restoration uses the existing double-rAF pattern extended with scrollTo as the final step.

### Edge cases

| Scenario                                      | Behavior                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Close active tab                              | Activate nearest tab (right, then left). Last tab shows empty state          |
| Close tab with unsaved comment text           | Close immediately — ephemeral state, expected behavior                       |
| Document changes on disk while on another tab | SSE live-reload updates store for that path; content is fresh on switch-back |
| Same file via different paths                 | Deduplicate by resolved absolute path in CLI                                 |

## Deferrals

| Feature                                | Reason                                              |
| -------------------------------------- | --------------------------------------------------- |
| Split view                             | Separate feature; tabs are the foundation           |
| Add-from-browser                       | CLI + directory mode covers primary use cases first |
| Tab reordering                         | Polish, not essential                               |
| Cross-document comment search          | No current demand                                   |
| Tab persistence across server restarts | Overkill for a dev tool                             |
| Bulk export across documents           | Per-document export works; bulk is convenience      |

## Migration Path

Incremental — store introduced alongside existing hooks, components migrate one at a time:

1. Create store with `openDocument` / `setActiveDocument`
2. Add `TabBar`, wrap existing App content in `DocumentView`
3. Migrate `useComments` into store (biggest change)
4. Migrate selection, scroll, hover state into store
5. Remove emptied hooks, rename components
6. Add multi-file CLI + server endpoints

Each step is independently shippable and testable.
