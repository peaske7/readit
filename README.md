# 📖 readit

A CLI tool to review Markdown and HTML documents with inline comments. View your documents in a clean web interface, add comments as margin notes next to highlighted text, and export them for AI or apply back to source.

Inspired by [difit](https://github.com/yoshiko-pg/difit) - the local code review tool for the AI era.

## ⚡ Quick Start

```bash
npx readit document.md    # Review your Markdown in browser
```

## 🚀 Usage

### Basic Usage

```bash
readit <file.md>                    # Review Markdown file
readit <file.html>                  # Review HTML file
readit <file.md> --port 3000        # Custom port
readit <file.md> --no-open          # Don't auto-open browser
readit <file.md> --clean            # Clear existing comments
```

### CLI Options

| Flag | Default | Description |
| --- | --- | --- |
| `<file>` | - | Markdown (.md) or HTML (.html) file to review |
| `--port` | 4567 | Port to run server on |
| `--host` | 127.0.0.1 | Host address to bind to |
| `--no-open` | false | Don't automatically open browser |
| `--clean` | false | Clear all existing comments on startup |

### Subcommands

```bash
readit list              # List all files with comments
readit show <file>       # Show comments for a specific file
```

## 💬 Comment System

readit includes a review comment system with margin notes (similar to Google Docs):

1. **Select Text**: Highlight any text in the document
2. **Add Comment**: Type your comment in the input area (⌘+Enter to save)
3. **Margin Notes**: Comments appear as notes next to highlighted text
4. **Edit/Delete**: Click on any margin note to edit or delete
5. **Copy for LLM**: Copy selection or comment with surrounding context (⌘⇧C)
6. **Copy All**: Copy all comments formatted for AI prompts
7. **Export JSON**: Download comments as JSON file

### Comment Format

When you copy comments, they're formatted for AI:

```
# Review Comments for document.md

---
Selected text: "This is the selected text"
Comment: This needs to be more specific

---
Selected text: "Another selection"
Comment: Consider rephrasing this section
```

## 📋 Requirements

- Node.js ≥ 22.0.0

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Start development server (with hot reload)
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Lint and format (Biome)
pnpm check
pnpm check:fix
pnpm typecheck
```

## 🏗️ Architecture

- **CLI**: Commander.js for argument parsing
- **Backend**: Express server for API and static files
- **Markdown**: react-markdown for client-side rendering
- **HTML**: unified + rehype for safe HTML processing
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4
- **Testing**: Vitest
- **Quality**: Biome (lint + format), lefthook

## 📄 License

MIT

## 🙏 Acknowledgments

- [difit](https://github.com/yoshiko-pg/difit) for the inspiration and UX patterns
