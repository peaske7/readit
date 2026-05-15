# readit

A CLI tool to review Markdown documents with inline comments. Add margin notes to highlighted text, then export for AI or apply back to source.

<img width="4014" height="2440" alt="CleanShot 2025-12-25 at 09 23 20@2x" src="https://github.com/user-attachments/assets/2dfda51c-b5a2-45ef-839f-e3ab5854bf90" />

![CleanShot 2025-12-25 at 09 28 39](https://github.com/user-attachments/assets/f111da46-da64-4193-a2d5-49310ef9d060)

Inspired by [difit](https://github.com/yoshiko-pg/difit).

## Requirements

- [Bun](https://bun.sh) >= 1.0

## Quick Start

```bash
bunx readit document.md
```

## Install

Install globally with any package manager. Bun is required at runtime regardless of how you install.

```bash
bun add -g @peaske7/readit       # bun
pnpm add -g @peaske7/readit      # pnpm
npm install -g @peaske7/readit   # npm
```

Then run `readit <file>` directly without `bunx`.

## Usage

```bash
readit <file>                 # Review a .md or .markdown file
readit <file> --port 3000     # Custom port (default: 4567)
readit <file> --host 0.0.0.0  # Custom host (default: 127.0.0.1)
readit <file> --no-open       # Don't auto-open browser
readit <file> --clean         # Clear existing comments

readit list                   # List all files with comments
readit show <file>            # Show comments for a file
readit open <files...>        # Add files to running server
readit completion zsh         # Output shell integration script
```

Select text to add comments. Comments appear as margin notes. Copy all comments formatted for AI with a single click.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt + ↑` / `Alt + ↓` | Previous / next comment |
| `⌘ + C` | Copy selected text |
| `⌘ + Shift + C` | Copy selection with LLM context (line numbers + surrounding lines) |

All shortcuts are rebindable from the settings panel.

## Shell Integration

readit provides rich shell completions and an `@` file picker for zsh, bash, and fish.

### Zsh (recommended)

Add to your `~/.zshrc`:

```bash
eval "$(readit completion zsh)"
```

This gives you:

- **`@` file picker** -- type `readit @` and press Tab to open an fzf-powered markdown file picker with preview. Type `readit @test` + Tab to pre-filter to files matching "test".
- **Standard completion** -- Tab-complete subcommands (`open`, `list`, `show`, `completion`), options (`--port`, `--clean`), and markdown file paths.
- **Syntax highlighting** -- `@file.md` tokens are highlighted in cyan (requires [zsh-syntax-highlighting](https://github.com/zsh-users/zsh-syntax-highlighting)).
- **`ri` alias** -- shorthand for `readit`.

Optional dependencies for the best experience: [fzf](https://github.com/junegunn/fzf), [fd](https://github.com/sharkdp/fd), [bat](https://github.com/sharkdp/bat).

### Bash

```bash
eval "$(readit completion bash)"
```

### Fish

```fish
readit completion fish | source
```

## Neovim Plugin

The `nvim-readit` plugin lets you open markdown files in readit directly from Neovim. Edits in Neovim are reflected in the browser automatically via live reload.

### Installation (lazy.nvim)

```lua
{
  dir = "path/to/readit/nvim-readit",  -- or install from repo
  ft = "markdown",
  opts = {},
}
```

### Commands

| Command | Keymap | Description |
|---|---|---|
| `:Readit` | `<leader>ro` | Open current buffer in readit |
| `:Readit <path>` | -- | Open a specific file in readit |
| `:ReaditReload` | `<leader>rr` | Save and reload in browser |
| `:ReaditStop` | `<leader>rq` | Stop the readit server |
| `:ReaditStatus` | `<leader>ri` | Show server status |
| `:ReaditList` | `<leader>rl` | Pick from files with comments |

### Configuration

```lua
require("readit").setup({
  bun_path = "bun",           -- Path to bun executable
  port = 0,                   -- 0 = auto-select free port
  host = "127.0.0.1",
  auto_open = true,           -- Open browser on :Readit (once per server)
  keymap_prefix = "<leader>r", -- Change keymap prefix
})
```

Run `:checkhealth readit` to verify your setup.

## Live Reload

readit watches open documents for changes and automatically refreshes the browser. This works with any editor:

- **Standard saves** -- detected via `fs.watch()` change events.
- **Vim/Neovim/Emacs saves** -- these editors write to a temp file then rename. readit detects rename events and re-establishes the file watcher automatically.
- **SSE auto-reconnect** -- if the browser loses its connection to the server, it reconnects with exponential backoff.

No configuration needed. Open a file with `readit`, edit it in any editor, and the browser updates within ~200ms.

## VS Code Extension

The `vscode-readit` extension provides a side-by-side preview panel inside VS Code. See [vscode-readit/](vscode-readit/) for details.

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
