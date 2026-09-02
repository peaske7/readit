import { parseCommentFile } from "../../src/lib/comment-storage";
import { resolveComments } from "../../src/lib/resolve-comments";
import type { InlineData } from "../../src/schema";
import { renderTemplate } from "../../src/template";
import manifest from "./manifest.json";
import type { ShareMeta, ShareSnapshot } from "./store";

const entry = (manifest as Record<string, { file: string; css?: string[] }>)[
  "index.html"
];

/** The same page the local server renders, with hosted flags in the inline data. */
export function renderSharePage(
  meta: ShareMeta,
  snapshot: ShareSnapshot,
): string {
  const filePath = `/s/${meta.id}/${meta.fileName}`;
  const comments = snapshot.comments
    ? resolveComments({
        comments: parseCommentFile(snapshot.comments).comments,
        source: snapshot.source,
        html: snapshot.html,
      })
    : [];

  const inlineData: InlineData = {
    files: [{ path: filePath, fileName: meta.fileName }],
    activeFile: filePath,
    clean: false,
    workingDirectory: "",
    documents: { [filePath]: { headings: meta.headings, comments } },
    settings: { version: 1, fontFamily: "serif" },
    hosted: true,
    apiBase: `/s/${meta.id}`,
  };

  return renderTemplate({
    title: meta.fileName,
    cssPath: entry.css?.[0] ? `/${entry.css[0]}` : "",
    jsPath: `/${entry.file}`,
    documentHtml: snapshot.html,
    inlineData,
    isDev: false,
    fontFamily: "serif",
  });
}

export function renderUnlockPage(id: string, failed: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>readit — locked</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #fafafa; color: #222; }
    form { display: grid; gap: .75rem; width: min(20rem, 90vw); }
    h1 { margin: 0; font-size: 1.1rem; font-weight: 600; }
    input, button { font: inherit; padding: .6rem .8rem; border-radius: .5rem; border: 1px solid #bbb; background: #fff; color: inherit; }
    button { background: #222; color: #fff; border-color: #222; cursor: pointer; }
    .err { color: #b00020; margin: 0; font-size: .9rem; }
    @media (prefers-color-scheme: dark) {
      body { background: #18181b; color: #e4e4e7; }
      input { background: #27272a; border-color: #52525b; }
      button { background: #e4e4e7; color: #18181b; border-color: #e4e4e7; }
      .err { color: #f87171; }
    }
  </style>
</head>
<body>
  <form method="post" action="/s/${id}/unlock">
    <h1>This document is password protected</h1>
    ${failed ? '<p class="err">Wrong password, try again.</p>' : ""}
    <input type="password" name="password" autofocus required autocomplete="current-password" placeholder="Password">
    <button type="submit">Open</button>
  </form>
</body>
</html>`;
}
