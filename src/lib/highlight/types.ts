export interface TextPosition {
  start: number;
  end: number;
}

export interface HighlightComment {
  id: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

export interface TextNodeInfo {
  node: Text;
  start: number;
  end: number;
}
