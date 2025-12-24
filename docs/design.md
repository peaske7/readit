# Comment Storage Design

This document describes the design for storing highlights, comments, and document state in plain markdown files instead of localStorage.

## Design Goals

| Priority | Goal | Description |
|----------|------|-------------|
| 1 | **Hackability** | Simple, understandable, editable with any text editor |
| 2 | **Simplicity** | Minimal complexity, easy to implement |
| 3 | **Versioning** | Git-native, full history support |
| 4 | **Diffing** | Human-readable, line-based diffs |
| 5 | **Performance** | Fast reads/writes for typical use cases |

---

## Current State (localStorage)

The current implementation uses browser localStorage:

```typescript
interface Comment {
  id: string;           // UUID
  selectedText: string; // Highlighted text
  comment: string;      // User's comment
  createdAt: string;    // ISO 8601 timestamp
  startOffset: number;  // Character offset (start)
  endOffset: number;    // Character offset (end)
}
```

**Storage key**: `readit-comments-{filePath}`

### Limitations

1. **Browser-only**: Comments don't persist across devices
2. **No versioning**: No history, no git integration
3. **Offset fragility**: Character offsets break when document changes
4. **Not shareable**: Manual export required to share reviews

---

## Storage Location

### Global Home Directory: `~/.readit/`

readit is a global CLI tool. All comment files are stored in a single location:

```
~/.readit/
└── comments/
    └── {path-based-structure}/
        └── {filename}.comments.md
```

### Why Global `~/.readit/`?

| Concern | Solution |
|---------|----------|
| No scattered `.readit/` folders | Single location for all comments |
| Easy to find | `~/.readit/comments/` contains everything |
| Easy to backup | Copy one directory |
| Cross-project | Works the same for any file, anywhere |
| Precedent | Similar to `~/.ssh/`, `~/.config/`, `~/.docker/` |

### Path Structure

Comments are stored using the **absolute path** of the source file, converted to a directory structure:

```
Source file:     /home/user/projects/app/README.md
Comment file:    ~/.readit/comments/home/user/projects/app/README.comments.md

Source file:     /Users/jay/docs/design.md
Comment file:    ~/.readit/comments/Users/jay/docs/design.comments.md
```

### Path Resolution Algorithm

```typescript
import * as path from 'path';
import * as os from 'os';

function getCommentPath(sourcePath: string): string {
  // Resolve to absolute path
  const absolute = path.resolve(sourcePath);

  // Remove leading slash and drive letter (Windows)
  const normalized = absolute.replace(/^\//, '').replace(/^[A-Z]:/, '');

  // Get filename without extension
  const ext = path.extname(normalized);
  const withoutExt = normalized.slice(0, -ext.length);

  // Construct comment file path
  return path.join(
    os.homedir(),
    '.readit',
    'comments',
    `${withoutExt}.comments.md`
  );
}
```

### Examples

| Source Path | Comment File Path |
|-------------|-------------------|
| `./README.md` (from `/home/user/project`) | `~/.readit/comments/home/user/project/README.comments.md` |
| `/tmp/notes.md` | `~/.readit/comments/tmp/notes.comments.md` |
| `../shared/doc.md` (from `/home/user/project`) | `~/.readit/comments/home/user/shared/doc.comments.md` |
| `~/Desktop/review.html` | `~/.readit/comments/Users/jay/Desktop/review.comments.md` |

### Edge Cases

**Same filename, different directories**: No collision—absolute paths differ.

```
/home/user/project-a/README.md → ~/.readit/comments/home/user/project-a/README.comments.md
/home/user/project-b/README.md → ~/.readit/comments/home/user/project-b/README.comments.md
```

**Relative paths from different CWDs**: Resolve to same absolute path → same comment file.

```bash
# From /project/src/
readit ../README.md      # → /project/README.md

# From /project/src/deep/
readit ../../README.md   # → /project/README.md (same file, same comments)
```

---

## File Format

```markdown
---
source: /home/user/project/README.md
hash: e3b0c44298fc1c14
version: 1
---

<!-- c:550e8400|L42|2025-12-24T10:30:00+09:00 -->
> the exact selected text from the document

My review comment here. Full markdown supported.
Can span multiple paragraphs.

---

<!-- c:660f9511|L57-59|2025-12-24T11:00:00+09:00 -->
> another piece of selected text
> that spans multiple lines

Another comment with my thoughts.

---
```

### Format Breakdown

#### 1. YAML Front Matter

```yaml
---
source: /home/user/project/README.md   # Absolute path to source file
hash: e3b0c44298fc1c14                 # SHA-256 prefix (16 chars) of source content
version: 1                             # Format version for future compatibility
---
```

**Purpose**: Document-level metadata for validation and future-proofing.

#### 2. Comment Metadata (HTML Comment)

```html
<!-- c:550e8400|L42|2025-12-24T10:30:00+09:00 -->
```

**Format**: `c:{id}|{line-hint}|{timestamp}`

| Field | Description | Example |
|-------|-------------|---------|
| `id` | UUID prefix (8 chars) | `550e8400` |
| `line-hint` | Line number(s) in source | `L42` or `L42-45` |
| `timestamp` | ISO 8601 with timezone | `2025-12-24T10:30:00+09:00` |

**Why HTML comment?**

- Invisible when rendered in markdown viewers
- Single line = clean git diffs
- Grep-friendly for tooling

#### 3. Selected Text (Blockquote)

```markdown
> the exact selected text from the document
```

**Purpose**: Primary anchor for matching. The text itself is the anchor.

**Multi-line selections**:

```markdown
> first line of selection
> second line of selection
> third line of selection
```

#### 4. Comment Body (Plain Text)

```markdown
My review comment here. Full markdown supported.
Can span multiple paragraphs.

- Lists work
- **Bold** and *italic* work
- `code` works
```

#### 5. Separator

```markdown
---
```

**Purpose**: Visual separation between comments, easy parsing boundary.

---

## Anchoring Strategy

### The Problem

Character offsets are fragile. When the source document changes:

- Insertions shift all following offsets
- Deletions shift all following offsets
- Even whitespace changes break anchors

### The Solution: Text-First Anchoring

**Primary anchor**: The selected text itself
**Secondary hint**: Line number for fast lookup

### Matching Algorithm

```
findAnchor(source, selectedText, lineHint):
  1. Fast path: Search near line hint (±500 chars)
     - If found, return position

  2. Fallback: Global search in document
     - If found, return position

  3. Fuzzy: Levenshtein distance matching (optional)
     - For handling minor edits to selected text

  4. Fail: Return null, show warning in UI
```

### Resilience

| Document Change | Effect on Anchors |
|-----------------|-------------------|
| Insert text before selection | Line hint shifts, text match still works |
| Insert text after selection | No effect |
| Edit unrelated text | No effect |
| Edit selected text | Fuzzy match or manual re-anchor |
| Delete selected text | Anchor fails, user notified |

---

## Edge Cases

### Same text appears multiple times

```markdown
> the
```

**Solution**: Line hint disambiguates. Take the match closest to the hinted line.

### Selected text was edited

**Solution**:

1. Fuzzy matching with Levenshtein distance
2. Show "anchor uncertain" warning
3. User can re-anchor manually

### Document hash mismatch

**UI Warning**:

```
Document has changed since review.
Some comments may be misaligned.
```

### Empty selection or whitespace-only

**Prevention**: Reject selections that are empty or whitespace-only at input time.

### Very long selections

**Practical limit**: Store full text up to 1000 chars. Beyond that, store first 500 + `...` + last 500.

---

## Known Limitations

### Single-Tab Per File

readit does not support multiple browser tabs reviewing the same file simultaneously.
If two tabs edit comments for the same file, the last write wins and earlier changes may be lost.

**Workaround**: Close other tabs before starting a new review session.

### Cross-Machine Path Differences

Comments are stored using absolute paths. If you sync `~/.readit/` across machines
with different path structures (e.g., `/Users/jay/` on Mac vs `/home/jay/` on Linux),
comments will not be associated with the same source files.

**Workaround**: Use readit on a single machine, or ensure identical absolute paths.

### Export is a Transform

Export (JSON, prompt format) is a transformation of in-memory comments, not a storage format.
The canonical format is `.comments.md`.

---

## Storage Protocol

### Data Types

```typescript
interface CommentFile {
  source: string;        // Absolute path to source file
  hash: string;          // SHA-256 prefix (16 chars) of source content
  version: number;       // Format version
  comments: Comment[];
}

interface Comment {
  id: string;            // Full UUID (stored as 8-char prefix in file)
  selectedText: string;  // Primary anchor (the quoted text)
  lineHint: string;      // "L42" or "L42-45"
  createdAt: string;     // ISO 8601 with timezone
  body: string;          // Comment text (markdown)
}
```

### Read Protocol

```
1. Resolve source path to absolute path
2. Compute comment file path: ~/.readit/comments/{path}.comments.md
3. Check if comment file exists (no file = no comments)
4. Parse YAML front matter
5. Verify source path matches (warn if different)
6. Compare hash with current source content (warn if mismatch)
7. Split body by "---" separator
8. For each block:
   a. Extract metadata from HTML comment
   b. Extract selected text from blockquote
   c. Extract body (remaining text)
9. Resolve anchors to character offsets using text matching
10. Return resolved comments for rendering
```

### Write Protocol

```
1. Resolve source path to absolute path
2. Compute comment file path: ~/.readit/comments/{path}.comments.md
3. Ensure parent directories exist (mkdir -p)
4. Compute source content hash (SHA-256, take first 16 chars)
5. Generate YAML front matter with source, hash, version
6. For each comment:
   a. Compute current line number for selected text
   b. Format metadata as HTML comment
   c. Format selected text as blockquote (prefix each line with "> ")
   d. Append comment body
   e. Add "---" separator
7. Write to temp file
8. Atomic rename to final path
```

### Sync on Source Change

```
On source file load:
  1. Compute current source hash
  2. Compare with stored hash in comment file
  3. If different:
     - Re-run anchor matching for all comments
     - Update line hints to current positions
     - Flag any unresolved anchors
     - Update stored hash
     - Save updated comment file
```

---

## CLI Integration

### Commands

```bash
# Review a file (opens browser UI)
readit <file>

# Review with options
readit <file> --port 3000      # Custom port
readit <file> --no-open        # Don't auto-open browser
readit <file> --clean          # Clear existing comments for this file

# List all commented files
readit list

# Show comments for a file (without opening UI)
readit show <file>

# Export comments
readit export <file> --format json
readit export <file> --format prompt
```

### Server API

The Express server provides endpoints for the browser UI:

```
GET  /api/comments           # Get comments for current file
POST /api/comments           # Add a new comment
PUT  /api/comments/:id       # Update a comment
DELETE /api/comments/:id     # Delete a comment
GET  /api/source             # Get source file info (path, hash)
```

---

## Performance

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Load comments | O(n) | Parse markdown once, n = number of comments |
| Find anchor | O(1) avg | Line hint + local text search |
| Save comments | O(n) | Full file rewrite |
| Add comment | O(n) | Append + rewrite |

For typical use (<100 comments per file), all operations are instantaneous.

### File System Considerations

- Comment files are small (typically <100KB)
- Directory structure mirrors source paths (may be deep)
- Atomic writes via temp file + rename

---

## Migration from localStorage

### Strategy

1. On app load, check for localStorage data for current file
2. If localStorage has data and no comment file exists:
   - Prompt user to migrate
   - Convert comments to new format
   - Write to `~/.readit/comments/...`
   - Optionally clear localStorage
3. If both exist:
   - Prefer file-based (authoritative)
   - Warn about localStorage orphan

### Conversion

```typescript
function migrateComment(old: OldComment, sourceContent: string): NewComment {
  return {
    id: old.id.slice(0, 8),
    selectedText: old.selectedText,
    lineHint: `L${getLineNumber(sourceContent, old.startOffset)}`,
    createdAt: old.createdAt,
    body: old.comment,
  };
}

function getLineNumber(content: string, offset: number): number {
  return content.slice(0, offset).split('\n').length;
}
```

---

## Future Considerations

### Local `.readit/` Override

For projects that want to commit comments with the source code:

```bash
# Initialize local .readit/ in current directory
readit init --local

# Now comments for files in this directory tree use local storage
./project/.readit/comments/README.comments.md
```

**Lookup order** (future):

1. Check for `.readit/` in source file's directory (or ancestors)
2. If found, use local storage
3. Otherwise, use global `~/.readit/`

### Potential Extensions

1. **Author field**: `<!-- c:abc123|L42|2025-12-24|@username -->`
2. **Status/resolution**: Resolved, won't fix, etc.
3. **Replies**: Nested comments (threaded discussion)
4. **Tags/categories**: Bug, question, suggestion, etc.

### Format Versioning

The `version: 1` field in front matter allows future format changes:

```yaml
---
version: 2
# New fields in v2...
---
```

Parser can handle multiple versions for backwards compatibility.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-24 | Global `~/.readit/` storage | readit is a global CLI; avoids scattered `.readit/` folders |
| 2025-12-24 | Path-based directory structure | Intuitive mapping from source path to comment file |
| 2025-12-24 | Absolute path in front matter | Self-documenting, enables validation |
| 2025-12-24 | Text-based anchoring over offsets | Resilient to document changes |
| 2025-12-24 | Markdown format over YAML/JSON | Human-readable, hackable, editable |
| 2025-12-24 | HTML comments for metadata | Invisible in viewers, clean git diffs |
| 2025-12-24 | Blockquotes for selected text | Standard markdown, visually distinct |
| 2025-12-24 | 8-char UUID prefix | Collision-resistant, grep-friendly |
| 2025-12-24 | Local `.readit/` as future option | Deferred to keep v1 simple |

---

## References

- Original localStorage implementation: `src/hooks/useComments.ts`
- Current types: `src/types/index.ts`
- Export utilities: `src/lib/export.ts`
- Inspiration: [difit](https://github.com/yoshiko-pg/difit) - local code review for AI era
