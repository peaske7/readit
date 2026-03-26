export const Locales = {
  JA: "ja",
  EN: "en",
} as const;

export type Locale = (typeof Locales)[keyof typeof Locales];

export interface Translations {
  // App
  "app.loading": string;
  "app.noDocuments": string;
  "app.noDocumentsHintPrefix": string;
  "app.noDocumentsHintSuffix": string;
  "app.footer": string;

  // Header
  "header.selectTextToReanchor": string;

  // Actions menu
  "actions.ariaLabel": string;
  "actions.settings": string;
  "actions.reload": string;
  "actions.copyAll": string;
  "actions.exportJson": string;
  "actions.viewRaw": string;

  // Settings
  "settings.title": string;
  "settings.theme": string;
  "settings.font": string;
  "settings.language": string;
  "settings.theme.system": string;
  "settings.theme.light": string;
  "settings.theme.dark": string;
  "settings.font.serif": string;
  "settings.font.sansSerif": string;

  // Comment input
  "comment.placeholder": string;
  "comment.cancel": string;
  "comment.addNote": string;
  "comment.highlight": string;

  // Margin note
  "marginNote.addNote": string;
  "marginNote.delete": string;
  "marginNote.edit": string;
  "marginNote.copy": string;

  // Comment manager
  "commentManager.unresolved": string;
  "commentManager.deleteAllConfirm": string;
  "commentManager.delete": string;
  "commentManager.cancel": string;
  "commentManager.copyAllTitle": string;
  "commentManager.deleteAllTitle": string;
  "commentManager.noComments": string;

  // Comment list item
  "commentList.edit": string;
  "commentList.delete": string;
  "commentList.goTo": string;
  "commentList.reanchor": string;
  "commentList.unresolved": string;

  // Comment nav
  "commentNav.previous": string;
  "commentNav.next": string;
  "commentNav.of": string;

  // Inline editor
  "editor.save": string;
  "editor.cancel": string;

  // Reanchor confirm
  "reanchor.question": string;
  "reanchor.confirm": string;
  "reanchor.cancel": string;

  // Raw comments modal
  "rawModal.title": string;
  "rawModal.copyTitle": string;
  "rawModal.loading": string;
  "rawModal.noComments": string;
  "rawModal.copiedToClipboard": string;
  "rawModal.failedToCopy": string;

  // Toast messages
  "toast.copied": string;
  "toast.copiedAllComments": string;

  // Comment badge
  "commentBadge.title": string;
  "commentBadge.titlePlural": string;
}

export type TranslationKey = keyof Translations;
