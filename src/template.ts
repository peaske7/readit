export interface TemplateOptions {
  title: string;
  cssPath: string;
  jsPath: string;
  documentHtml: string;
  inlineData: object;
  isDev: boolean;
  fontFamily: string;
}

function safeJsonStringify(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Sanitize server-rendered HTML to prevent XSS from raw HTML in markdown source.
 * While readit is designed for local use with the user's own files, this
 * provides defense-in-depth against untrusted markdown content.
 *
 * Uses a simple tag-stripping approach to remove dangerous elements while
 * preserving the rendered content. The Go server uses bluemonday for the
 * same purpose.
 */
function sanitizeHtml(html: string): string {
  // Remove <script> tags and their content
  let sanitized = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
  // Remove event handler attributes (onclick, onerror, onload, etc.)
  sanitized = sanitized.replace(
    /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );
  // Remove javascript: URLs
  sanitized = sanitized.replace(
    /\bhref\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
    "",
  );
  sanitized = sanitized.replace(
    /\bsrc\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
    "",
  );
  return sanitized;
}

export function renderTemplate(options: TemplateOptions): string {
  const {
    title,
    cssPath,
    jsPath,
    documentHtml,
    inlineData,
    isDev,
    fontFamily,
  } = options;

  const viteClient = isDev
    ? '<script type="module" src="http://127.0.0.1:24678/@vite/client"></script>'
    : "";

  const cssLink = cssPath
    ? `<link rel="stylesheet" href="${escapeAttr(cssPath)}">`
    : "";
  const proseClass = fontFamily === "sans-serif" ? "prose-sans" : "prose-serif";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>readit — ${escapeHtml(title)}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📖</text></svg>">
  <script>
    (() => {
      var t = localStorage.getItem("readit:theme");
      var d = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
      if (d) document.documentElement.classList.add("dark");
    })();
  </script>
  ${viteClient}
  ${cssLink}
</head>
<body class="min-h-screen">
  <article id="document-content" class="prose ${proseClass}">${sanitizeHtml(documentHtml)}</article>
  <div id="app"></div>
  <script type="application/json" id="__readit">${safeJsonStringify(inlineData)}</script>
  <script type="module" src="${escapeAttr(jsPath)}" defer></script>
</body>
</html>`;
}
