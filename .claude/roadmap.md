# Development Roadmap

## v0.1.0 - MVP ✅

- [x] CLI with Commander.js
- [x] react-markdown for Markdown rendering
- [x] HTML file support with unified/rehype (XSS protection)
- [x] Express server serving static files
- [x] React 19 frontend with Tailwind CSS v4
- [x] Text selection → comment input
- [x] Margin notes UI (Google Docs style)
- [x] Highlight commented text with yellow background
- [x] Copy All / Export JSON
- [x] File-based comment persistence (`.comments.md` files)
- [x] Copy for LLM feature (⌘⇧C) - copy selection/comment with surrounding context
- [x] CLI subcommands: `list`, `show`

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
- [ ] Integration tests for storage edge cases:
  - [ ] Large documents (10K+ lines)
  - [ ] Many comments (100+)
  - [ ] Unicode/emoji in selections
  - [ ] Concurrent tab simulation
  - [ ] Document changes between sessions
  - [ ] Corrupt/malformed comment files

## v0.3.0 - Comment Resolution Workflow

Review documents, add comments, then resolve one-by-one with LLM assistance.

- [ ] Comment status (`unresolved` / `resolved`)
  - [ ] Add `status` field to Comment type
  - [ ] Store status in `.comments.md` metadata: `<!-- c:{id}|{lineHint}|{timestamp}|{status} -->`
  - [ ] Default new comments to `unresolved`
- [ ] Navigate unresolved comments
  - [ ] "Next unresolved" / "Previous unresolved" keyboard shortcuts
  - [ ] Unresolved count in header
- [ ] Visual status indicators
  - [ ] Minimap: yellow = unresolved, green = resolved
  - [ ] Margin notes: status badge + toggle button
  - [ ] Highlight colors: yellow = unresolved, muted = resolved
- [ ] Per-comment LLM copy
  - [ ] Copy single comment + context (⌘⇧C on margin note)
  - [ ] Include file path, line numbers, heading context
- [ ] Mark resolved action
  - [ ] Click to toggle status
  - [ ] Auto-navigate to next unresolved (optional)

## v0.4.0 - Visual Enhancements

- [x] Highlight commented text in document (moved to v0.1.0)
- [ ] Click highlight → scroll to margin note
- [ ] Click margin note → scroll to highlighted text
- [ ] Syntax highlighting for code blocks (Prism.js)
- [ ] Better mobile support

## v0.5.0 - Comment Categories

- [ ] Category selection (TODO, Question, Suggestion, Fix)
- [ ] Color-coded categories
- [ ] Filter by category
- [ ] Category in export format

## v0.6.0 - Multi-file Support

- [ ] Glob pattern support (`readit docs/*.md`)
- [ ] File navigation sidebar
- [ ] Per-file comment storage
- [ ] Bulk export across files

## Future Considerations

- Sticky notes (ペタペタ) - add notes not tied to text selection
- Collaborative mode (WebSocket sync)
- GitHub integration (create issues from comments)
- VS Code extension
- PDF export with highlights and comments - export the current document view as a PDF with all highlights and margin notes visible, preserving the visual review state for sharing or archiving
