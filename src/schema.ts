export const AnchorConfidences = {
  EXACT: "exact",
  NORMALIZED: "normalized",
  FUZZY: "fuzzy",
  UNRESOLVED: "unresolved",
} as const;

export type AnchorConfidence =
  (typeof AnchorConfidences)[keyof typeof AnchorConfidences];

export type ResolvedAnchorConfidence = Exclude<
  AnchorConfidence,
  typeof AnchorConfidences.UNRESOLVED
>;

export interface Comment {
  id: string;
  selectedText: string;
  comment: string;
  createdAt?: string;
  startOffset: number;
  endOffset: number;
  lineHint?: string;
  anchorConfidence?: AnchorConfidence;
  anchorPrefix?: string;
}

export interface CommentFile {
  source: string;
  hash: string;
  version: number;
  comments: Comment[];
}

export interface Anchor {
  start: number;
  end: number;
  line: number;
  confidence: ResolvedAnchorConfidence;
  distance?: number;
}

export interface SelectionRange {
  startOffset: number;
  endOffset: number;
}

export interface Selection extends SelectionRange {
  text: string;
}

export interface Document {
  html: string;
  filePath: string;
  fileName: string;
  clean: boolean;
}

export const FontFamilies = {
  SERIF: "serif",
  SANS_SERIF: "sans-serif",
} as const;

export type FontFamily = (typeof FontFamilies)[keyof typeof FontFamilies];

export const ThemeModes = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const;

export type ThemeMode = (typeof ThemeModes)[keyof typeof ThemeModes];

export interface ShortcutBinding {
  key: string;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

export interface KeybindingOverride {
  id: string;
  binding?: ShortcutBinding;
  enabled: boolean;
}

export interface DocumentSettings {
  version: number;
  fontFamily: FontFamily;
  onboarded?: boolean;
  keybindings?: KeybindingOverride[];
}

export interface InlineDocData {
  html?: string;
  headings: { id: string; text: string; level: number }[];
  comments: Comment[];
}

/** JSON embedded in the page as `#__readit`, produced by every readit server. */
export interface InlineData {
  files: { path: string; fileName: string }[];
  activeFile: string;
  clean: boolean;
  workingDirectory: string;
  documents: Record<string, InlineDocData>;
  settings: {
    version: number;
    fontFamily: string;
    keybindings?: KeybindingOverride[];
  };
  /** True when served as a published snapshot with no live server behind it. */
  hosted?: boolean;
  /** True when this server can publish the document to a share remote. */
  canShare?: boolean;
  /** Prefix for every `/api/...` request, e.g. `/s/{id}`. */
  apiBase?: string;
}

export const ShareModes = {
  PUBLIC: "public",
  LINK: "link",
  PASSWORD: "password",
} as const;
export type ShareMode = (typeof ShareModes)[keyof typeof ShareModes];

export function isShareMode(value: unknown): value is ShareMode {
  return (
    value === ShareModes.PUBLIC ||
    value === ShareModes.LINK ||
    value === ShareModes.PASSWORD
  );
}

export const TableModes = {
  AUTO: "auto",
  FIT: "fit",
  WIDE: "wide",
} as const;

export type TableMode = (typeof TableModes)[keyof typeof TableModes];
