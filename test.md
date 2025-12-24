# readit - Markdown Review Tool

A CLI tool for reviewing Markdown documents with inline comments.

## Features

- **Text Selection**: Select any text in the rendered HTML to add a comment
- **Comment Management**: Edit, delete, and copy individual comments
- **Export Options**: Copy all comments as a prompt or export as JSON
- **Persistent Storage**: Comments are saved in localStorage per file

## Installation

```bash
npm install -g readit
```

## Usage

Basic usage:

```bash
readit document.md           # Open document for review
readit document.md --port 3000  # Custom port
readit document.md --no-open    # Don't auto-open browser
```

## How it works

1. Converts Markdown to HTML using Pandoc
2. Serves the HTML in a local web server
3. Provides a UI for adding comments to selected text
4. Stores comments in browser localStorage
5. Exports comments for applying back to source

## Technical Details

The tool uses:

- **CLI**: Commander.js for argument parsing
- **Server**: Express.js for serving files and API
- **Conversion**: Pandoc for Markdown → HTML
- **Frontend**: React with Tailwind CSS
- **Storage**: Browser localStorage for persistence

## Future Plans

- [ ] Apply comments back to Markdown as inline comments
- [ ] Support for different comment formats
- [ ] Collaborative review mode
- [ ] Syntax highlighting for code blocks
