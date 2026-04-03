# readit

A CLI tool to review Markdown and HTML documents with inline comments. Add margin notes to highlighted text, then export for AI or apply back to source.

<img width="4014" height="2440" alt="CleanShot 2025-12-25 at 09 23 20@2x" src="https://github.com/user-attachments/assets/2dfda51c-b5a2-45ef-839f-e3ab5854bf90" />

![CleanShot 2025-12-25 at 09 28 39](https://github.com/user-attachments/assets/f111da46-da64-4193-a2d5-49310ef9d060)

Inspired by [difit](https://github.com/yoshiko-pg/difit).

## Requirements

- [Bun](https://bun.sh) >= 1.0

## Quick Start

```bash
bunx readit document.md
```

## Usage

```bash
readit <file>                 # Review a .md or .html file
readit <file> --port 3000     # Custom port (default: 4567)
readit <file> --host 0.0.0.0  # Custom host (default: 127.0.0.1)
readit <file> --no-open       # Don't auto-open browser
readit <file> --clean         # Clear existing comments

readit list                  # List all files with comments
readit show <file>           # Show comments for a file
readit open <files...>       # Add files to running server
```

Select text to add comments. Comments appear as margin notes. Copy all comments formatted for AI with a single click.

## Development

```bash
bun install       # Install dependencies
bun dev           # Start dev server
bun run build     # Build for production
bun run test      # Run tests
bun run check     # Lint and format (Biome)
```

## License

MIT
