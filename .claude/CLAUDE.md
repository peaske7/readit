# CLAUDE.md

## Project Overview

**readit** is a CLI tool for reviewing Markdown and HTML documents with inline comments. It serves documents in a local web interface and allows users to add comments to selected text. Comments appear as margin notes next to highlighted text (similar to Google Docs). Comments can be exported for use with AI coding assistants or applied back to the source document.

Inspired by [difit](https://github.com/yoshiko-pg/difit) - a local code review tool for the AI era.

## Quick Reference

```bash
# Development
bun install           # Install dependencies
bun dev               # Start dev server (CLI with --watch)
bun run dev:client    # Start Vite dev server only
bun run build         # Build for production (Vite + CLI)
bun run test          # Run unit tests (Vitest)
bun run test:e2e      # Run e2e tests (Playwright)
bun run test:perf     # Run performance tests
bun run bench         # Run benchmarks
bun run typecheck     # Run TypeScript checks
bun run check         # Run Biome (lint + format check)
bun run check:fix     # Fix lint + format issues
bun run format        # Format with Biome

# Usage
bunx readit <file.md>               # Review Markdown file
bunx readit <file.html>             # Review HTML file
bunx readit <file.md> --port 3000   # Custom port
bunx readit <file.md> --host 0.0.0.0  # Custom host address
bunx readit <file.md> --no-open     # Don't auto-open browser
bunx readit <file.md> --clean       # Clear existing comments

bunx readit list                    # List all files with comments
bunx readit show <file.md>          # Show comments for a file
bunx readit open <files...>         # Add files to running server
```

## Architecture

```
readit/
├── src/
│   ├── cli.ts                 # CLI entry point (Commander.js)
│   ├── server.ts              # Bun.serve() server + API routes
│   ├── App.svelte             # Main Svelte component
│   ├── main.ts                # Svelte entry point
│   ├── schema.ts              # TypeScript types
│   ├── template.ts            # HTML template rendering
│   ├── index.css              # Tailwind styles + CSS custom properties
│   ├── components/
│   │   ├── Header.svelte
│   │   ├── DocumentViewer.svelte  # Renders document HTML
│   │   ├── CommentInput.svelte    # Comment input area
│   │   ├── CommentNav.svelte      # Navigate between comments
│   │   ├── CommentListItem.svelte # Comment item in manager
│   │   ├── CommentManager.svelte  # Comment management panel
│   │   ├── CommentBadge.svelte    # Comment count badge
│   │   ├── MarginNote.svelte      # Individual margin note
│   │   ├── MarginNotesContainer.svelte
│   │   ├── ActionsMenu.svelte     # Actions dropdown menu
│   │   ├── InlineEditor.svelte    # Inline text editing
│   │   ├── RawModal.svelte        # View raw .comments.md file
│   │   ├── ReanchorConfirm.svelte # Re-anchor confirmation dialog
│   │   ├── SettingsModal.svelte   # Settings modal
│   │   ├── ShortcutCapture.svelte # Keyboard shortcut capture
│   │   ├── ShortcutList.svelte    # Keyboard shortcuts list
│   │   ├── TabBar.svelte          # Multi-file tab bar
│   │   ├── TableOfContents.svelte # Document headings navigation
│   │   └── ui/                    # Primitive UI components
│   │       ├── ActionLink.svelte
│   │       ├── Button.svelte
│   │       ├── Dialog.svelte
│   │       ├── DropdownMenu.svelte
│   │       ├── DropdownMenuItem.svelte
│   │       ├── DropdownMenuSeparator.svelte
│   │       └── Text.svelte
│   ├── stores/                # Svelte 5 reactive stores
│   │   ├── app.svelte.ts      # Application state
│   │   ├── settings.svelte.ts # User settings
│   │   ├── shortcuts.svelte.ts # Keyboard shortcuts
│   │   ├── locale.svelte.ts   # i18n state
│   │   └── ui.svelte.ts       # UI state
│   └── lib/
│       ├── anchor.ts          # Anchor-based comment resolution
│       ├── comment-storage.ts # File-based comment storage
│       ├── export.ts          # Export utilities (JSON, prompt format)
│       ├── headings.ts        # Heading extraction
│       ├── html-text.ts       # HTML text extraction
│       ├── margin-layout.ts   # Margin note position resolution
│       ├── markdown-renderer.ts # Server-side markdown rendering
│       ├── mermaid-renderer.ts  # Mermaid diagram rendering
│       ├── mermaid-config.ts  # Mermaid configuration
│       ├── positions.ts       # Position calculations
│       ├── shortcut-registry.ts # Keyboard shortcut registry
│       ├── utils.ts           # Common utilities (cn, etc.)
│       ├── highlight/         # Text highlighting system
│       │   ├── highlighter.ts # Highlight manager
│       │   ├── highlight-registry.ts # Highlight registry
│       │   ├── resolver.ts    # Highlight resolution
│       │   ├── dom.ts         # DOM manipulation
│       │   └── types.ts       # Type definitions
│       └── i18n/              # Internationalization
│           ├── index.ts
│           ├── translations.ts
│           ├── types.ts
│           ├── en.ts          # English translations
│           └── ja.ts          # Japanese translations
├── e2e/                       # Playwright e2e tests
├── dist/                      # Built output
├── .claude/                   # AI agent docs
│   ├── user-stories.md
│   ├── roadmap.md
│   └── settings.json
├── CLAUDE.md                  # This file
├── AGENTS.md                  # AI agent instructions
└── CHANGELOG.md               # Version changelog
```

## Key Design Decisions

1. **markdown-it for Markdown**: Server-side rendering with shiki for syntax highlighting
2. **Mermaid for diagrams**: Server-side Mermaid diagram rendering
3. **Margin notes UX**: Comments appear as margin notes next to highlighted text (Google Docs style)
4. **File-based comments**: Human-readable `.comments.md` files stored in `~/.readit/comments/`
5. **difit-style UX**: CLI → local server → browser, familiar pattern
6. **Svelte 5 stores for state**: Reactive stores (`.svelte.ts`) for state management
7. **i18n support**: English and Japanese translations

## Tech Stack

- **Runtime**: Bun
- **CLI**: Commander.js for argument parsing
- **Server**: Bun.serve() for API, SSE, and static files
- **Markdown Rendering**: markdown-it (server-side) + shiki (syntax highlighting)
- **Frontend**: Svelte 5 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Icons**: lucide-svelte
- **Testing**: Vitest (unit) + Playwright (e2e)
- **Quality**: Biome (lint + format), lefthook

## Current Limitations

- Comments use anchor-based text matching, may break if document changes significantly
- No comment status tracking yet (resolved/unresolved planned for v0.3.0)

## User Stories

See `.claude/user-stories.md` for detailed user stories and acceptance criteria.

## Code Style

- TypeScript strict mode
- Svelte 5 components with reactive stores
- Tailwind for styling
- ESM modules throughout
- Co-located test files (`*.test.ts`, `*.bench.ts`)
- E2E tests in `e2e/`
