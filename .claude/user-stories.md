# User Stories

## Core Workflow

### US-001: View Document in Browser

**As a** writer/reviewer
**I want to** view my Markdown or HTML document rendered in a browser
**So that** I can review the content in a more readable format

**Acceptance Criteria:**

- Run `readit document.md` or `readit document.html` and browser opens with rendered content
- react-markdown for Markdown, unified/rehype for HTML (client-side rendering)
- Clean light theme with good typography for reading

---

### US-002: Add Comment to Selected Text

**As a** reviewer
**I want to** select text and add a comment
**So that** I can note feedback or changes needed

**Acceptance Criteria:**

- Select any text in the document
- Input area appears in margin to enter comment
- ⌘+Enter saves the comment
- Comment appears as margin note next to highlighted text
- Selection is preserved as reference

---

### US-003: Manage Comments

**As a** reviewer
**I want to** edit, delete, and copy individual comments
**So that** I can refine my feedback

**Acceptance Criteria:**

- Each margin note shows: selected text (truncated) + comment text
- Click to edit → inline textarea editing
- Delete button → removes comment and highlight
- Copy button → copies "Selected: ... Comment: ..." format

---

### US-004: Export All Comments

**As a** reviewer  
**I want to** export all comments at once  
**So that** I can use them with AI or share with others  

**Acceptance Criteria:**

- "Copy All" button copies formatted prompt to clipboard
- "Export JSON" button downloads JSON file with all comments
- Format is AI-friendly (clear structure)

---

### US-005: Persistent Comments ✅

**As a** reviewer
**I want to** close and reopen the tool without losing comments
**So that** I can continue review sessions

**Acceptance Criteria:**

- Comments saved to `.comments.md` files in `~/.readit/comments/`
- Comments restored when reopening same file
- Different files have separate comment storage
- Human-readable markdown format for LLM/git compatibility

**Status:** Implemented (file-based storage)

---

## Planned Features

### US-006: File-Based Comment Storage ✅

**As a** reviewer
**I want to** have my comments stored in a plain markdown file
**So that** I can version them with git, share them, and use them with LLMs and other tools

**Acceptance Criteria:**

- Comments stored in `~/.readit/comments/{hashed-path}/{filename}.comments.md`
- Format is human-readable markdown (selected text as quote, comment below)
- ~~Existing localStorage comments migrated on first run~~ (localStorage removed)
- Comments auto-save to file on add/edit/delete
- ~~`--storage local|file` flag~~ (file-only, no flag needed)
- File can be edited manually and changes reflected on refresh

**Status:** Implemented

---

### US-007: Comment Resolution Workflow

**As a** reviewer
**I want to** mark comments as resolved/unresolved and navigate between them
**So that** I can systematically address feedback with LLM assistance

**Acceptance Criteria:**

- Each comment has `unresolved` or `resolved` status
- New comments default to `unresolved`
- Visual indicators: yellow = unresolved, green/muted = resolved
- Navigate to next/previous unresolved comment (keyboard shortcuts)
- Unresolved count displayed in header
- Copy single comment with context for LLM discussion (⌘⇧C on margin note)
- Toggle status with one click, optionally auto-navigate to next

**Status:** Not implemented (planned for v0.3.0)

---

### US-008: Highlight Commented Text ✅

**As a** reviewer
**I want to** see which parts of the document have comments
**So that** I can quickly identify reviewed sections

**Acceptance Criteria:**

- Text with comments has yellow background highlight (`<mark>` tags)
- Margin notes are positioned next to their corresponding highlights
- ~~Clicking highlight scrolls to comment~~ (not yet implemented)
- ~~Clicking comment scrolls to text~~ (not yet implemented)

**Status:** Implemented (basic highlighting and margin notes)

---

### US-009: Comment Categories

**As a** reviewer  
**I want to** categorize comments (TODO, Question, Suggestion, etc.)  
**So that** I can organize and filter feedback  

**Acceptance Criteria:**

- Dropdown to select category when adding comment
- Visual indicator (color/icon) per category
- Filter sidebar by category
- Export includes category information

**Status:** Not implemented

---

### US-010: Review Multiple Files

**As a** reviewer  
**I want to** review multiple Markdown files in one session  
**So that** I can review an entire document set  

**Acceptance Criteria:**

- `readit docs/*.md` opens multi-file view
- File tabs or sidebar navigation
- Comments stored per file
- Bulk export across all files

**Status:** Not implemented

---

### US-011: Collaborative Review

**As a** team lead  
**I want to** share review sessions with teammates  
**So that** we can collaborate on document feedback  

**Acceptance Criteria:**

- Generate shareable link
- Real-time sync of comments
- Author attribution on comments
- Conflict resolution for simultaneous edits

**Status:** Not implemented (future consideration)

---

### US-012: Export Document as PDF with Comments

**As a** reviewer
**I want to** export the current document view as a PDF
**So that** I can share or archive the reviewed document with all highlights and comments visible

**Acceptance Criteria:**

- "Export PDF" button in the header
- PDF includes the rendered document with highlighted text
- Margin notes are included next to their corresponding highlights
- PDF preserves the visual layout of the review interface
- Filename follows pattern: `{original-filename}-reviewed.pdf`

**Status:** Not implemented (future consideration)

---

## Technical Stories

### TS-001: CLI Argument Parsing

- Use Commander.js for CLI
- Main command: `<file>`, `--port`, `--host`, `--no-open`, `--clean`
- Subcommands: `list` (show all commented files), `show <file>` (display comments for a file)
- Validate file exists and is Markdown (.md) or HTML (.html)
- Graceful error messages

### TS-002: Server Architecture

- Express server serves API + static files
- `/api/document` returns `{ content, type, filePath, fileName, clean }`
- `/api/heartbeat` SSE for browser disconnect detection
- Development mode proxies to Vite
- Production mode serves built assets from dist/

### TS-003: Build System

- Vite for frontend bundling
- tsup for CLI bundling
- Single `npm run build` produces complete distributable
- `npx readit` works without global install

### TS-004: File-Based Comment Storage

- Store comments in `~/.readit/comments/{hashed-path}/{filename}.comments.md`
- Markdown format for human/LLM readability:

  ```markdown
  ## Comment 1
  > Selected text here

  Comment text here

  ---
  ```

- API endpoints: `GET/POST/PUT/DELETE /api/comments` for CRUD operations
- Watch file for external changes (optional)
