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
  createdAt: string;
  startOffset: number;
  endOffset: number;
  /** e.g. "L42" or "L42-L55" */
  lineHint?: string;
  anchorConfidence?: AnchorConfidence;
  /** First N chars of original text for anchor matching when selectedText is truncated */
  anchorPrefix?: string;
}

export interface CommentFile {
  source: string;
  /** SHA-256 prefix (16 chars) */
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
  content: string;
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

export interface DocumentSettings {
  version: number;
  fontFamily: FontFamily;
  onboarded?: boolean;
}
