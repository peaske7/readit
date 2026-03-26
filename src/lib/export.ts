import type { Comment, Document } from "../schema";

export function formatComment(c: Comment): string {
  const line = c.lineHint ? `[${c.lineHint}] ` : "";
  return `${line}"${c.selectedText}"\n${c.comment}`;
}

export function generatePrompt(comments: Comment[], fileName: string): string {
  return `# Review Comments for ${fileName}\n\n${comments.map(formatComment).join("\n\n---\n\n")}`;
}

export function exportCommentsAsJson(
  comments: Comment[],
  document: Document,
): void {
  const data = {
    filePath: document.filePath,
    fileName: document.fileName,
    exportedAt: new Date().toISOString(),
    comments: comments.map((c) => ({
      selectedText: c.selectedText,
      comment: c.comment,
      lineHint: c.lineHint,
      createdAt: c.createdAt,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = `${document.fileName}-comments.json`;
  a.click();
  URL.revokeObjectURL(url);
}
