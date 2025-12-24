# CLAUDE.md

## Project Overview

**readit** is a CLI tool for reviewing Markdown and HTML documents with inline comments. It serves documents in a local web interface and allows users to add comments to selected text. Comments appear as margin notes next to highlighted text (similar to Google Docs). Comments can be exported for use with AI coding assistants or applied back to the source document.

Inspired by [difit](https://github.com/yoshiko-pg/difit) - a local code review tool for the AI era.

## Quick Reference

```bash
# Development
pnpm install          # Install dependencies
pnpm dev              # Start dev server (Vite + CLI)
pnpm build            # Build for production
pnpm test             # Run tests
pnpm typecheck        # Run TypeScript checks
pnpm check            # Run Biome (lint + format check)
pnpm check:fix        # Fix lint + format issues
pnpm format           # Format with Biome

# Usage
npx readit <file.md>              # Review Markdown file
npx readit <file.html>            # Review HTML file
npx readit <file.md> --port 3000  # Custom port
npx readit <file.md> --no-open    # Don't auto-open browser
npx readit <file.md> --clean      # Clear existing comments
```

## Architecture

```
readit/
├── src/
│   ├── cli/
│   │   └── index.ts           # CLI entry point (Commander.js)
│   ├── server/
│   │   └── index.ts           # Express server + API routes
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── DocumentViewer.tsx # Renders MD (react-markdown) or HTML (IframeContainer)
│   │   ├── IframeContainer.tsx # Isolated HTML rendering with comment support
│   │   ├── CodeBlock.tsx      # Syntax-highlighted code blocks
│   │   ├── CommentInputArea.tsx
│   │   ├── CommentListItem.tsx # Comment item in manager dropdown
│   │   ├── CommentManagerDropdown.tsx # Dropdown menu for managing comments
│   │   ├── CommentMinimap.tsx # Visual minimap of comment positions
│   │   ├── CommentNavigator.tsx # Navigate between comments
│   │   ├── MarginNote.tsx     # Individual margin note
│   │   ├── MarginNotesContainer.tsx
│   │   ├── RawCommentsModal.tsx # View raw .comments.md file
│   │   ├── TableOfContents.tsx # Document headings navigation
│   │   └── index.ts
│   ├── hooks/
│   │   ├── useComments.ts     # Comment state management
│   │   ├── useCommentNavigation.ts # Navigate between comments
│   │   ├── useDocument.ts     # Document fetching and state
│   │   ├── useHeadings.ts     # Extract headings from document
│   │   ├── useReanchorMode.ts # Re-anchor mode for unresolved comments
│   │   ├── useScrollMetrics.ts # Scroll position tracking
│   │   ├── useScrollSpy.ts    # Track scroll position for TOC
│   │   ├── useTextSelection.ts # Text selection handling
│   │   └── index.ts
│   ├── lib/
│   │   ├── anchor.ts          # Anchor-based comment resolution
│   │   ├── comment-storage.ts # File-based comment storage
│   │   ├── context.ts         # LLM context extraction
│   │   ├── export.ts          # Export utilities (JSON, prompt format)
│   │   ├── html-processor.tsx # HTML sanitization (unified/rehype)
│   │   ├── layout-constants.ts # Layout dimensions and breakpoints
│   │   ├── scroll.ts          # Scroll calculation utilities
│   │   ├── utils.ts           # Common utilities (cn, etc.)
│   │   └── highlight/         # Text highlighting system
│   │       ├── index.ts
│   │       ├── highlighter.ts # Unified highlighter factory
│   │       ├── core.ts        # Core highlight logic
│   │       ├── dom.ts         # DOM manipulation
│   │       ├── colors.ts      # Comment color palette
│   │       ├── types.ts       # Type definitions
│   │       └── script-builder.ts
│   ├── types/
│   │   └── index.ts           # Shared types
│   ├── App.tsx                # Main React component
│   ├── main.tsx               # React entry point
│   └── index.css              # Tailwind styles
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

1. **react-markdown for Markdown**: Client-side rendering, no external dependencies
2. **unified/rehype for HTML**: Safe HTML rendering with XSS protection via html-processor
3. **IframeContainer for HTML isolation**: Renders HTML in sandboxed iframe to prevent style/script leakage
4. **Margin notes UX**: Comments appear as margin notes next to highlighted text (Google Docs style)
5. **File-based comments**: Human-readable `.comments.md` files stored in `~/.readit/comments/`
6. **difit-style UX**: CLI → local server → browser, familiar pattern
7. **Hooks for state**: Custom hooks for comment management

## Tech Stack

- **CLI**: Commander.js for argument parsing
- **Server**: Express.js for API and static files
- **Markdown Rendering**: react-markdown
- **HTML Rendering**: unified + rehype-parse + rehype-react (with XSS sanitization)
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest
- **Quality**: Biome (lint + format), lefthook

## Current Limitations

- Comments use text offset, may break if document changes significantly
- No comment status tracking yet (resolved/unresolved planned for v0.3.0)

## User Stories

See `.claude/user-stories.md` for detailed user stories and acceptance criteria.

## Code Style

- TypeScript strict mode
- Functional React components with hooks
- Tailwind for styling (no CSS-in-JS)
- ESM modules throughout
- Co-located test files (`*.test.ts`)
