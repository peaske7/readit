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
  "actions.settings": "Settings",
  "actions.reload": "Reload",
  "actions.copyAll": "Copy All",
  "actions.exportJson": "Export JSON",
  "actions.viewRaw": "View Raw",

  // Settings
  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.font": "Font",
  "settings.language": "Language",
  "settings.theme.system": "System",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.font.serif": "Serif",
  "settings.font.sansSerif": "Sans-serif",

  // Comment input
  "comment.placeholder": "Add your comment...",
  "comment.cancel": "Cancel",
  "comment.addNote": "Add Note",
  "comment.highlight": "Highlight",

  // Margin note
  "marginNote.addNote": "Add note",
  "marginNote.delete": "Delete",
  "marginNote.edit": "Edit",
  "marginNote.copy": "Copy",

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

  // Toast messages
  "toast.copied": 'Copied: "{{text}}"',
  "toast.copiedAllComments": "Copied all comments",

  // Comment badge
  "commentBadge.title": "{{count}} comment",
  "commentBadge.titlePlural": "{{count}} comments",

  // Keyboard shortcuts
  "shortcuts.title": "Keyboard Shortcuts",
  "shortcutGroup.copy": "Copy",
  "shortcutGroup.navigate": "Navigate",
  "shortcutGroup.other": "Other",
  "shortcuts.resetToDefaults": "Reset to defaults",
  "shortcuts.enableDisable": "Enable/disable shortcut",
  "shortcutCapture.pressKeys": "Press keys...",
  "shortcutCapture.reserved": "{{binding}} is reserved",
  "shortcutCapture.ariaLabel": "Press a key combination",
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

  // Mermaid diagram
  "mermaid.modalTitle": "Mermaid diagram",
  "mermaid.viewGraph": "Graph",
  "mermaid.viewCode": "Code",
  "mermaid.showSource": "Show source",
  "mermaid.showDiagram": "Show diagram",
  "mermaid.expand": "Expand diagram",
  "mermaid.zoomIn": "Zoom in",
  "mermaid.zoomOut": "Zoom out",
  "mermaid.zoomFit": "Fit to screen",
  "mermaid.zoomReset": "Reset zoom",
};
