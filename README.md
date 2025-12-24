# readit

A CLI tool to review Markdown and HTML documents with inline comments. Add margin notes to highlighted text, then export for AI or apply back to source.

![CleanShot 2025-12-25 at 01 53 49](https://github.com/user-attachments/assets/1259af1d-36a8-4142-9b38-5d80d160324b)

Inspired by [difit](https://github.com/yoshiko-pg/difit).

## Quick Start

```bash
npx readit document.md
```

## Usage

```bash
readit <file>                # Review a .md or .html file
readit <file> --port 3000    # Custom port (default: 4567)
readit <file> --no-open      # Don't auto-open browser
readit <file> --clean        # Clear existing comments

readit list                  # List all files with comments
readit show <file>           # Show comments for a file
```

Select text to add comments. Comments appear as margin notes. Copy all comments formatted for AI with a single click.

## Development

```bash
pnpm install      # Install dependencies
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm test         # Run tests
pnpm check        # Lint and format (Biome)
```

## License

MIT
