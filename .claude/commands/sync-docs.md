---
description: Sync documentation with current codebase implementation
allowed-tools: Read, Grep, Glob, Edit
---

# Sync Documentation

Compare documentation files against the actual codebase and fix discrepancies.

## Files to Sync

| File | What to verify |
|------|----------------|
| `CLAUDE.md` | Architecture diagram, component list, tech stack, CLI options |
| `README.md` | Node.js version, usage examples, requirements, feature descriptions |
| `.claude/user-stories.md` | Implementation status, acceptance criteria accuracy |
| `.claude/roadmap.md` | Completed vs planned features, removed tech references |

## Process

### Step 1: Read Source of Truth

Read these files to understand actual implementation:

```
package.json          → version, dependencies, Node.js requirement
src/cli/index.ts      → CLI flags, supported file types
src/server/index.ts   → API routes
src/components/*.tsx  → component names
src/lib/*.ts          → utilities
```

### Step 2: Compare and Report

For each doc file, check for:

- **Version mismatches** (Node.js, React, package version)
- **Removed dependencies** still mentioned (e.g., Pandoc)
- **Renamed/deleted components** in architecture diagrams
- **Implemented features** still marked "Not implemented"
- **New CLI flags** not documented
- **UI terminology** changes (e.g., "sidebar" → "margin notes")

### Step 3: Output Format

```markdown
## Documentation Sync Report

### Discrepancies Found

#### CLAUDE.md
1. **Architecture diagram**: Lists `CommentSidebar.tsx` but file doesn't exist
   - **Fix**: Update to `MarginNote.tsx`, `MarginNotesContainer.tsx`

#### README.md
1. **Node.js version**: Says "≥18" but package.json requires "≥22"
   - **Fix**: Update to ≥22.0.0

### ✓ Already Accurate
- .claude/roadmap.md
```

### Step 4: Fix

After listing all discrepancies, ask for confirmation, then apply fixes using Edit tool.

## When to Run

- Before releases
- After adding/removing features
- After refactoring components
