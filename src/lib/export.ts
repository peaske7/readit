import type { Comment, Document } from "../types";

export function generatePrompt(comments: Comment[], fileName: string): string {
  const prompt = comments
    .map((c) => {
      return `---\nSelected text: "${c.selectedText}"\nComment: ${c.comment}`;
    })
    .join("\n\n");

  return `# Review Comments for ${fileName}\n\n${prompt}`;
}

export function generateRawText(comments: Comment[]): string {
  return comments
    .map((c) => `${c.selectedText}\n\n${c.comment}`)
    .join("\n\n---\n\n");
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
