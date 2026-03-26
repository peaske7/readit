import MarkdownIt from "markdown-it";
import type { BundledLanguage, BundledTheme, HighlighterGeneric } from "shiki";
import { type Heading, parseMarkdownHeadings } from "./headings";

const SHIKI_LANGUAGES: BundledLanguage[] = [
  "bash",
  "css",
  "diff",
  "go",
  "graphql",
  "javascript",
  "json",
  "jsx",
  "markdown",
  "python",
  "rust",
  "sql",
  "tsx",
  "typescript",
  "yaml",
];

const SHIKI_THEME: BundledTheme = "one-dark-pro";

let shikiInstance: HighlighterGeneric<BundledLanguage, BundledTheme> | null =
  null;
let shikiPromise: Promise<
  HighlighterGeneric<BundledLanguage, BundledTheme>
> | null = null;

async function getShiki(): Promise<
  HighlighterGeneric<BundledLanguage, BundledTheme>
> {
  if (shikiInstance) return shikiInstance;
  if (shikiPromise) return shikiPromise;

  shikiPromise = import("shiki").then(async ({ createHighlighter }) => {
    const highlighter = await createHighlighter({
      themes: [SHIKI_THEME],
      langs: SHIKI_LANGUAGES,
    });
    shikiInstance = highlighter;
    return highlighter;
  });

  return shikiPromise;
}

function createMarkdownRenderer(
  shiki: HighlighterGeneric<BundledLanguage, BundledTheme>,
): MarkdownIt {
  const md = new MarkdownIt({
    html: true, // Allow raw HTML (matches rehype-raw behavior)
    linkify: true,
    typographer: false,
    highlight(code: string, lang: string): string {
      if (lang === "mermaid") {
        return `<pre><code class="language-mermaid">${md.utils.escapeHtml(code)}</code></pre>`;
      }

      const language = normalizeLanguage(lang);

      if (language && shiki.getLoadedLanguages().includes(language)) {
        return shiki.codeToHtml(code, {
          lang: language,
          theme: SHIKI_THEME,
        });
      }

      return `<pre class="shiki"><code>${md.utils.escapeHtml(code)}</code></pre>`;
    },
  });

  return md;
}

function normalizeLanguage(lang: string): BundledLanguage | undefined {
  const aliases: Record<string, BundledLanguage> = {
    sh: "bash",
    shell: "bash",
    js: "javascript",
    ts: "typescript",
    py: "python",
    rs: "rust",
    yml: "yaml",
    md: "markdown",
  };
  const normalized = lang.toLowerCase().trim();
  if (SHIKI_LANGUAGES.includes(normalized as BundledLanguage)) {
    return normalized as BundledLanguage;
  }
  return aliases[normalized];
}

function injectHeadingIds(html: string, headings: Heading[]): string {
  let headingIdx = 0;

  return html.replace(
    /<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag: string, attrs: string, content: string) => {
      if (headingIdx >= headings.length) return match;

      const heading = headings[headingIdx];
      headingIdx++;

      if (/\bid\s*=/.test(attrs)) return match;

      return `<${tag} id="${heading.id}"${attrs}>${content}</${tag}>`;
    },
  );
}

export interface RenderResult {
  html: string;
  headings: Heading[];
}

export async function initRenderer(): Promise<void> {
  await getShiki();
}

export async function renderMarkdown(content: string): Promise<RenderResult> {
  const shiki = await getShiki();
  const md = createMarkdownRenderer(shiki);

  const headings = parseMarkdownHeadings(content);

  let html = md.render(content);

  html = injectHeadingIds(html, headings);

  return { html, headings };
}
