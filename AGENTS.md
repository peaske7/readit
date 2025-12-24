# AGENTS.md

Instructions for AI coding agents working on this project.

## Project Context

readit is a CLI tool for reviewing Markdown documents with inline comments. The workflow is:

1. User runs `readit document.md`
2. CLI converts Markdown to HTML using Pandoc
3. Express server starts and opens browser
4. User selects text and adds comments
5. Comments are saved to localStorage
6. User can export comments for AI or apply back to Markdown

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start development (Vite + CLI hot reload)
pnpm build            # Build for production
pnpm test             # Run tests
pnpm typecheck        # TypeScript check
pnpm check            # Biome lint + format check
pnpm check:fix        # Fix issues
pnpm format           # Format code
```

## Code Organization

- `src/cli/` - CLI entry point, argument parsing
- `src/server/` - Express server, Pandoc integration
- `src/components/` - React UI components
- `src/hooks/` - Custom React hooks
- `src/lib/` - Utility functions
- `src/types/` - TypeScript types

## Testing

- Tests are co-located with source files (`*.test.ts`)
- Use Vitest for testing
- Run `pnpm test` before committing

## Commit Guidelines

- Use conventional commits (feat:, fix:, docs:, etc.)
- Keep commits focused and atomic
- Run `pnpm typecheck && pnpm check` before committing

## Adding Features

1. Check `.claude/user-stories.md` for planned features
2. Update types in `src/types/` first
3. Create/update hooks if needed
4. Create/update components
5. Add tests
6. Update CHANGELOG.md

## Key Files to Review

- `CLAUDE.md` - Project overview and architecture
- `.claude/user-stories.md` - User stories and acceptance criteria
- `.claude/roadmap.md` - Development roadmap
- `package.json` - Scripts and dependencies
