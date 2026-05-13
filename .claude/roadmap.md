# Development Roadmap

## v0.1.0 - MVP ✅

- [x] CLI with Commander.js
- [x] markdown-it for Markdown rendering (server-side with shiki syntax highlighting)
- [x] HTML file support
- [x] Bun.serve() server serving API + static files
- [x] Svelte 5 frontend with Tailwind CSS v4
- [x] Text selection → comment input
- [x] Margin notes UI (Google Docs style)
- [x] Highlight commented text with yellow background
- [x] Copy All / Export JSON
- [x] File-based comment persistence (`.comments.md` files)
- [x] Copy for LLM (⌘⇧C) - copy selection/comment with surrounding context
- [x] CLI subcommands: `list`, `show`, `open`

## v0.2.0 - File-Based Comment Storage ✅

Plain markdown storage enables git versioning, LLM accessibility, and cross-tool extensibility.

- [x] Store comments in `~/.readit/comments/{path}/{filename}.comments.md`
- [x] Human-readable markdown format with selected text + comment
- [x] Auto-save on comment add/edit/delete
- [x] Load comments from file on startup
- [x] Anchor-based text matching (survives minor document edits)

## v0.2.1 - Storage Robustness ✅

- [x] Version compatibility check in parser (error on future versions)
- [x] Anchor confidence propagation to UI (exact/fuzzy/unresolved indicators)
- [x] Selection truncation for very long texts (>1000 chars)
- [x] Document single-tab-per-file limitation
- [x] Document cross-machine path limitation

## v0.3.0 - Markdown Polish & Resolution Workflow (in progress)

- [x] Richer markdown support (rc.0)
- [x] Checkbox support (rc.1)
- [x] Richer LLM context copy: surrounding headings + line numbers (rc.2, #5)
- [x] Settings: persist keybinding overrides via `PUT /api/settings` (rc.4, #9)
- [x] Settings: serialize concurrent `PUT /api/settings` cycles (rc.4, #10)
- [x] Settings: suppress app shortcuts during keybinding rebind (rc.4, #8)
- [x] Density-adaptive margin note layout (rc.5, #11)
- [x] Margin comment popover opens in edit mode with auto-growing textarea (rc.5, #13)
- [x] Slack-aware growth for TIER_1 margin notes (rc.6, #12)
- [x] e2e test stability fixes (rc.4)

## v0.4.0 - Visual Enhancements ✅

- [x] Syntax highlighting for code blocks (shiki, server-side)
- [x] Click highlight → scroll to margin note
- [x] Click margin note → scroll to highlighted text
- [x] Mermaid diagram rendering
- [x] Layout mode toggle (centered / fullscreen)
- [x] Floating TOC in fullscreen mode
- [x] Settings modal with font preference (serif / sans-serif)
- [x] Per-document settings storage (`~/.readit/settings/`)

## v0.5.0 - Comment Categories

- [ ] Category selection (TODO, Question, Suggestion, Fix)
- [ ] Color-coded categories
- [ ] Filter by category
- [ ] Category in export format

## v0.6.0 - Multi-file Support (Partial ✅)

- [x] Multiple file arguments (`readit file1.md file2.md`)
- [x] Directory scanning (`readit <dir>`)
- [x] `readit open <files...>` to add files to running server
- [x] File tab navigation (TabBar.svelte)
- [x] Per-file comment storage
- [ ] Glob pattern support (`readit docs/*.md`)
- [ ] Bulk export across files

## v0.7.0 - Shell Integration & Editor Plugins ✅

- [x] Zsh integration with `@` file autocomplete (fzf-powered, Forge Code-style)
  - [x] `@<TAB>` launches fzf picker for markdown files
  - [x] `@partial<TAB>` pre-filters fzf query
  - [x] Syntax highlighting for `@*.md` patterns in command line
  - [x] Standard compdef completion for subcommands and options
  - [x] Bash and Fish completion scripts via `readit completion`
- [x] Neovim plugin (`nvim-readit/`)
  - [x] Server lifecycle management (start/stop/discover)
  - [x] `:ReaditOpen`, `:ReaditStop`, `:ReaditStatus`, `:ReaditReload`, `:ReaditList` commands
  - [x] Configurable keymaps (`<leader>r` prefix by default)
  - [x] `:checkhealth readit` support
  - [x] Auto-cleanup on VimLeavePre
- [x] VS Code extension (`vscode-readit/`)
- [x] Enhanced live reload on file changes
  - [x] Handle `rename` events (Vim/Neovim write-to-temp-then-rename saves)
  - [x] Auto re-establish watcher after rename with retry logic
  - [x] SSE auto-reconnect with exponential backoff
  - [x] Parallel document + comments fetch on reload

## Infrastructure ✅

Cross-cutting work not tied to a single milestone:

- [x] Go production binary (`go/`, `Makefile`) — single-binary distribution with embedded frontend via `go:embed`
- [x] Internationalization (`src/lib/i18n/`) — English + Japanese translations
- [x] Biome (lint + format) + lefthook + Vitest + Playwright

## Future Considerations

- Better mobile support
- Storage edge-case test suite (large documents, 100+ comments, unicode/emoji, concurrent tabs, corrupt files)
- Sticky notes (ペタペタ) — add notes not tied to text selection
- Collaborative mode (WebSocket sync)
- GitHub integration (create issues from comments)
- PDF export with highlights and comments — export the current document view as a PDF with all highlights and margin notes visible, preserving the visual review state for sharing or archiving
