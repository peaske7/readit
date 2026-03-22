import type { Translations } from "./types";

export const ja: Translations = {
  // App
  "app.loading": "読み込み中...",
  "app.noDocuments": "開いているドキュメントがありません。",
  "app.noDocumentsHintPrefix": "",
  "app.noDocumentsHintSuffix": "を実行してファイルを追加してください。",
  "app.footer": "Made with ❤️ by Jay and Claude",

  // Header
  "header.selectTextToReanchor": "テキストを選択して再アンカー",

  // Actions menu
  "actions.ariaLabel": "操作メニュー",
  "actions.centered": "中央揃え",
  "actions.fullscreen": "全画面",
  "actions.settings": "設定",
  "actions.reload": "再読み込み",
  "actions.copyAllAI": "全てコピー (AI)",
  "actions.copyAllAITitle": "AIアシスタント用プロンプト形式でコピー",
  "actions.copyAllRaw": "全てコピー (テキスト)",
  "actions.copyAllRawTitle": "プレーンテキストとしてコピー",
  "actions.exportJson": "JSONエクスポート",
  "actions.viewRaw": "生データを表示",

  // Settings
  "settings.title": "設定",
  "settings.theme": "テーマ",
  "settings.font": "フォント",
  "settings.language": "言語",
  "settings.keyboardShortcuts": "キーボードショートカット",
  "settings.clickToRebind": "キーをクリックして変更",
  "settings.theme.system": "システム",
  "settings.theme.light": "ライト",
  "settings.theme.dark": "ダーク",
  "settings.font.serif": "明朝体",
  "settings.font.sansSerif": "ゴシック体",

  // Comment input
  "comment.placeholder": "コメントを入力...",
  "comment.cancel": "キャンセル",
  "comment.addNote": "メモを追加",
  "comment.highlight": "ハイライト",
  "comment.copyRawTitle": "テキストをコピー (⌘C)",
  "comment.copyRawLabel": "テキストをコピー",
  "comment.copyLLMTitle": "LLM用にコンテキスト付きでコピー (⌘⇧C)",
  "comment.copyLLMLabel": "LLM用にコピー",

  // Margin note
  "marginNote.addNote": "メモを追加",
  "marginNote.delete": "削除",
  "marginNote.edit": "編集",
  "marginNote.copy": "コピー",
  "marginNote.copyTitle": "テキストをコピー (⌘C)",
  "marginNote.llm": "LLM",
  "marginNote.llmTitle": "LLM用にコンテキスト付きでコピー (⌘⇧C)",

  // Comment manager
  "commentManager.unresolved": "未解決",
  "commentManager.deleteAllConfirm":
    "{{count}}件のコメントを全て削除しますか？",
  "commentManager.delete": "削除",
  "commentManager.cancel": "キャンセル",
  "commentManager.copyAllTitle": "全てのコメントをコピー",
  "commentManager.deleteAllTitle": "全てのコメントを削除",
  "commentManager.noComments": "コメントはまだありません",

  // Comment list item
  "commentList.edit": "編集",
  "commentList.delete": "削除",
  "commentList.goTo": "移動",
  "commentList.reanchor": "再アンカー",
  "commentList.unresolved": "未解決",

  // Comment nav
  "commentNav.previous": "前のコメント (Alt+↑)",
  "commentNav.next": "次のコメント (Alt+↓)",
  "commentNav.of": "{{current}} / {{total}}",

  // Inline editor
  "editor.save": "保存",
  "editor.cancel": "キャンセル",

  // Reanchor confirm
  "reanchor.question": "この選択範囲に再アンカーしますか？",
  "reanchor.confirm": "確認",
  "reanchor.cancel": "キャンセル",

  // Raw comments modal
  "rawModal.title": "コメント生データ",
  "rawModal.copyTitle": "クリップボードにコピー",
  "rawModal.loading": "読み込み中...",
  "rawModal.noComments":
    "コメントファイルはまだありません。コメントを追加して作成してください。",
  "rawModal.copiedToClipboard": "クリップボードにコピーしました",
  "rawModal.failedToCopy": "コピーに失敗しました",

  // Shortcut groups
  "shortcutGroup.copy": "コピー",
  "shortcutGroup.navigate": "ナビゲーション",
  "shortcutGroup.other": "その他",
  "shortcuts.resetToDefaults": "初期設定に戻す",
  "shortcuts.enableDisable": "ショートカットの有効/無効",
  "shortcutCapture.pressKeys": "キーを入力...",

  // Shortcut labels
  "shortcut.copyAll.label": "全てコピー (AI)",
  "shortcut.copyAll.description": "全コメントをAIプロンプト形式でコピー",
  "shortcut.copyAllRaw.label": "全てコピー (テキスト)",
  "shortcut.copyAllRaw.description": "全コメントをテキストとしてコピー",
  "shortcut.navigateNext.label": "次のコメント",
  "shortcut.navigateNext.description": "次のコメントに移動",
  "shortcut.navigatePrevious.label": "前のコメント",
  "shortcut.navigatePrevious.description": "前のコメントに移動",
  "shortcut.copySelectionRaw.label": "選択をコピー",
  "shortcut.copySelectionRaw.description": "選択テキストをコピー",
  "shortcut.copySelectionLLM.label": "選択をコピー (LLM)",
  "shortcut.copySelectionLLM.description":
    "選択テキストをLLM用コンテキスト付きでコピー",
  "shortcut.clearSelection.label": "選択を解除",
  "shortcut.clearSelection.description": "テキスト選択を解除",

  // Toast messages
  "toast.copied": 'コピーしました: "{{text}}"',
  "toast.copiedForLLM": 'LLM用にコピーしました: "{{text}}"',
  "toast.copiedAllComments": "全てのコメントをコピーしました",
  "toast.copiedAllRaw": "全てのコメントをテキストとしてコピーしました",

  // Floating TOC
  "floatingTOC.label": "目次",

  // Comment badge
  "commentBadge.title": "{{count}}件のコメント",
  "commentBadge.titlePlural": "{{count}}件のコメント",
};
