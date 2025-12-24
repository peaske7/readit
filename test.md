# Welcome to readit

A simple tool for reviewing markdown with inline comments.

---

## How It Works

readit follows a simple loop: **read → comment → extract**.

### 1. Read

You're already doing this. Open any markdown file with `npx readit <file.md>` and it renders in your browser with a clean reading experience.

### 2. Comment

Select any text to add a comment. Try it now — **select this sentence** and type your first comment.

Your comments appear as margin notes next to the highlighted text, just like reviewing a document in Google Docs. Add as many as you need.

### 3. Extract

When you're done reviewing, click the menu in the top-right and choose **Copy as Prompt**. This exports all your comments in a format ready for Claude, ChatGPT, or any AI assistant.

You can also export as JSON if you prefer structured data.

---

## Everything is Plain Markdown

Your comments are saved as `.comments.md` files in `~/.readit/comments/`. No database, no lock-in — just readable markdown files you can version control, search, or edit by hand.

Each comment file looks something like this:

```markdown
## Comment 1
**Selected:** "select this sentence"
**Comment:** This is my first comment!
**Created:** 2024-01-15T10:30:00Z
```

---

## Navigating Comments

Once you have multiple comments, use the navigation bar at the bottom of the screen to jump between them. You can also use keyboard shortcuts:

| Shortcut | Action |
|----------|--------|
| `Alt + ↑` | Previous comment |
| `Alt + ↓` | Next comment |

---

## Quick Start

```bash
# Review a markdown file
npx readit document.md

# Use a custom port
npx readit document.md --port 3000

# Start fresh (clear existing comments)
npx readit document.md --clean
```

---

## Try It Now

Go ahead and add a few comments to this document. When you're done, export them and see the output. That's the entire workflow — simple, transparent, and designed for reviewing AI-generated content.
