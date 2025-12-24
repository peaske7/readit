// Anchor confidence levels - const object pattern per style guide 6.3
export const AnchorConfidences = {
  EXACT: "exact",
  NORMALIZED: "normalized",
  FUZZY: "fuzzy",
  UNRESOLVED: "unresolved",
} as const;

export type AnchorConfidence =
  (typeof AnchorConfidences)[keyof typeof AnchorConfidences];

// Subset excluding "unresolved" for resolved anchors
export type ResolvedAnchorConfidence = Exclude<
  AnchorConfidence,
  typeof AnchorConfidences.UNRESOLVED
>;

export interface Comment {
  id: string;
  selectedText: string;
  comment: string;
  createdAt: string;
  // Position info for highlighting
  startOffset: number;
  endOffset: number;
  // Line hint for text-based anchoring (e.g., "L42" or "L42-45")
  lineHint?: string;
  // Confidence level of anchor resolution
  anchorConfidence?: AnchorConfidence;
  // First N chars of original text for anchor matching when selectedText is truncated
  anchorPrefix?: string;
}

// Parsed comment file structure
export interface CommentFile {
  source: string; // Absolute path to source file
  hash: string; // SHA-256 prefix (16 chars) of source content
  version: number; // Format version
  comments: Comment[];
}

// Anchor match result
export interface Anchor {
  start: number;
  end: number;
  line: number;
  confidence: ResolvedAnchorConfidence;
  distance?: number; // Levenshtein distance for fuzzy matches
}

export interface SelectionRange {
  startOffset: number;
  endOffset: number;
}

export interface Selection extends SelectionRange {
  text: string;
}

export type DocumentType = "markdown" | "html";

export interface Document {
  content: string;
  type: DocumentType;
  filePath: string;
  fileName: string;
  clean?: boolean;
}
