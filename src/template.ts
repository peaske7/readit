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

  const cssLink = cssPath ? `<link rel="stylesheet" href="${cssPath}">` : "";
  const proseClass = fontFamily === "sans-serif" ? "prose-sans" : "prose-serif";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>readit — ${title}</title>
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
  <article id="document-content" class="prose ${proseClass}">${documentHtml}</article>
  <div id="app"></div>
  <script type="application/json" id="__readit">${safeJsonStringify(inlineData)}</script>
  <script type="module" src="${jsPath}" defer></script>
</body>
</html>`;
}
