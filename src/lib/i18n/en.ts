import type { Translations } from "./types";

export const en: Translations = {
  // App
  "app.loading": "Loading...",
  "app.noDocuments": "No documents open.",
  "app.noDocumentsHintPrefix": "Run",
  "app.noDocumentsHintSuffix": "to add a file.",
  "app.footer": "Made with ❤️ by Jay and Claude",

  // Header
  "header.selectTextToReanchor": "Select text to re-anchor",

  // Actions menu
  "actions.ariaLabel": "Actions menu",
  "actions.centered": "Centered",
  "actions.fullscreen": "Fullscreen",
  "actions.settings": "Settings",
  "actions.reload": "Reload",
  "actions.copyAllAI": "Copy All (AI)",
  "actions.copyAllAITitle": "Copy in prompt format for AI assistants",
  "actions.copyAllRaw": "Copy All (Raw)",
  "actions.copyAllRawTitle": "Copy as plain text",
  "actions.exportJson": "Export JSON",
  "actions.viewRaw": "View Raw",

  // Settings
  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.font": "Font",
  "settings.language": "Language",
  "settings.keyboardShortcuts": "Keyboard Shortcuts",
  "settings.clickToRebind": "Click a key to rebind",
  "settings.theme.system": "System",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.font.serif": "Serif",
  "settings.font.sansSerif": "Sans-serif",
  "settings.editor": "Editor",
  "settings.editor.none": "None",
  "settings.editor.vscode": "VS Code",
  "settings.editor.vscodeInsiders": "VS Code Insiders",
  "settings.editor.cursor": "Cursor",

  // Comment input
  "comment.placeholder": "Add your comment...",
  "comment.cancel": "Cancel",
  "comment.addNote": "Add Note",
  "comment.highlight": "Highlight",
  "comment.copyRawTitle": "Copy raw text (⌘C)",
  "comment.copyRawLabel": "Copy raw text",
  "comment.copyLLMTitle": "Copy with context for LLM (⌘⇧C)",
  "comment.copyLLMLabel": "Copy for LLM",

  // Margin note
  "marginNote.addNote": "Add note",
  "marginNote.delete": "Delete",
  "marginNote.edit": "Edit",
  "marginNote.copy": "Copy",
  "marginNote.copyTitle": "Copy raw text (⌘C)",
  "marginNote.llm": "LLM",
  "marginNote.llmTitle": "Copy with context for LLM (⌘⇧C)",

  // Comment manager
  "commentManager.unresolved": "unresolved",
  "commentManager.deleteAllConfirm": "Delete all {{count}} comments?",
  "commentManager.delete": "Delete",
  "commentManager.cancel": "Cancel",
  "commentManager.copyAllTitle": "Copy all comments",
  "commentManager.deleteAllTitle": "Delete all comments",
  "commentManager.noComments": "No comments yet",

  // Comment list item
  "commentList.edit": "Edit",
  "commentList.delete": "Delete",
  "commentList.goTo": "Go to",
  "commentList.reanchor": "Re-anchor",
  "commentList.unresolved": "unresolved",

  // Comment nav
  "commentNav.previous": "Previous comment (Alt+↑)",
  "commentNav.next": "Next comment (Alt+↓)",
  "commentNav.of": "{{current}} of {{total}}",

  // Inline editor
  "editor.save": "Save",
  "editor.cancel": "Cancel",

  // Reanchor confirm
  "reanchor.question": "Re-anchor to this selection?",
  "reanchor.confirm": "Confirm",
  "reanchor.cancel": "Cancel",

  // Raw comments modal
  "rawModal.title": "Raw Comments",
  "rawModal.copyTitle": "Copy to clipboard",
  "rawModal.loading": "Loading...",
  "rawModal.noComments": "No comments file yet. Add comments to create one.",
  "rawModal.copiedToClipboard": "Copied to clipboard",
  "rawModal.failedToCopy": "Failed to copy",

  // Shortcut groups
  "shortcutGroup.copy": "Copy",
  "shortcutGroup.navigate": "Navigate",
  "shortcutGroup.other": "Other",
  "shortcuts.resetToDefaults": "Reset to defaults",
  "shortcuts.enableDisable": "Enable/disable shortcut",
  "shortcutCapture.pressKeys": "Press keys...",

  // Shortcut labels
  "shortcut.copyAll.label": "Copy All (AI)",
  "shortcut.copyAll.description": "Copy all comments in AI prompt format",
  "shortcut.copyAllRaw.label": "Copy All (Raw)",
  "shortcut.copyAllRaw.description": "Copy all comments as raw text",
  "shortcut.navigateNext.label": "Next Comment",
  "shortcut.navigateNext.description": "Navigate to next comment",
  "shortcut.navigatePrevious.label": "Previous Comment",
  "shortcut.navigatePrevious.description": "Navigate to previous comment",
  "shortcut.copySelectionRaw.label": "Copy Selection",
  "shortcut.copySelectionRaw.description": "Copy selected text",
  "shortcut.copySelectionLLM.label": "Copy Selection (LLM)",
  "shortcut.copySelectionLLM.description":
    "Copy selected text with context for LLM",
  "shortcut.clearSelection.label": "Clear Selection",
  "shortcut.clearSelection.description": "Clear text selection",

  // Toast messages
  "toast.copied": 'Copied: "{{text}}"',
  "toast.copiedForLLM": 'Copied for LLM: "{{text}}"',
  "toast.copiedAllComments": "Copied all comments",
  "toast.copiedAllRaw": "Copied all comments as raw text",

  // Floating TOC
  "floatingTOC.label": "Table of Contents",

  // Comment badge
  "commentBadge.title": "{{count}} comment",
  "commentBadge.titlePlural": "{{count}} comments",
};
