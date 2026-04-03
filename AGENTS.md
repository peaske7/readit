# AGENTS.md

Instructions for AI coding agents working on this project.

## Project Context

readit is a CLI tool for reviewing Markdown and HTML documents with inline comments. The workflow is:

1. User runs `readit document.md`
2. Server renders Markdown to HTML (markdown-it + shiki for syntax highlighting)
3. Bun.serve() starts and opens browser with Svelte 5 frontend
4. User selects text and adds comments
5. Comments are saved as `.comments.md` files in `~/.readit/comments/`
6. User can export comments for AI or apply back to Markdown

## Development Commands

```bash
bun install           # Install dependencies
bun dev               # Start development (CLI with --watch)
bun run dev:client    # Start Vite dev server only
bun run build         # Build for production (Vite + CLI)
bun run test          # Run unit tests (Vitest)
bun run test:e2e      # Run e2e tests (Playwright)
bun run typecheck     # TypeScript check
bun run check         # Biome lint + format check
bun run check:fix     # Fix lint + format issues
bun run format        # Format code with Biome
```

## Code Organization

- `src/cli.ts` - CLI entry point (Commander.js)
- `src/server.ts` - Bun.serve() server + API routes
- `src/components/` - Svelte 5 UI components
- `src/stores/` - Svelte 5 reactive stores (`.svelte.ts`)
- `src/lib/` - Utility functions, rendering, i18n
- `src/schema.ts` - TypeScript types

## Testing

- Unit tests are co-located with source files (`*.test.ts`)
- E2E tests live in `e2e/` (Playwright)
- Run `bun run test` before committing

## Commit Guidelines

- Use conventional commits (feat:, fix:, docs:, etc.)
- Keep commits focused and atomic
- Run `bun run typecheck && bun run check` before committing

## Adding Features

1. Check `.claude/user-stories.md` for planned features
2. Update types in `src/schema.ts` first
3. Create/update stores if needed (`src/stores/`)
4. Create/update Svelte components (`src/components/`)
5. Add tests

## Key Files to Review

- `CLAUDE.md` - Project overview and architecture
- `.claude/user-stories.md` - User stories and acceptance criteria
- `.claude/roadmap.md` - Development roadmap
- `package.json` - Scripts and dependencies
