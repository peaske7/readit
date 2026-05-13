import MarkdownIt from "markdown-it";
import type { BundledLanguage, BundledTheme, HighlighterGeneric } from "shiki";
import { type Heading, parseMarkdownHeadings } from "./headings";
import { renderMermaidBlocks } from "./mermaid-renderer";

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

export async function getShiki(): Promise<
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
    breaks: true,
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

interface RenderResult {
  html: string;
  headings: Heading[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function extractFrontmatter(src: string): {
  rest: string;
  frontmatter: string;
} {
  const match = src.match(FRONTMATTER_RE);
  if (!match) return { rest: src, frontmatter: "" };
  return { rest: src.slice(match[0].length), frontmatter: match[1].trim() };
}

function renderFrontmatterBlock(
  yaml: string,
  md: MarkdownIt,
  shiki: HighlighterGeneric<BundledLanguage, BundledTheme>,
): string {
  const highlighted = shiki.getLoadedLanguages().includes("yaml")
    ? shiki.codeToHtml(yaml, { lang: "yaml", theme: SHIKI_THEME })
    : `<pre><code class="language-yaml">${md.utils.escapeHtml(yaml)}</code></pre>`;
  return `<details class="frontmatter"><summary>Properties</summary>${highlighted}</details>`;
}

const TASK_ITEM_RE = /<li>(\s*(?:<p>)?)\[([ xX])\]\s/g;

function transformTaskLists(html: string): string {
  let idx = 0;
  return html.replace(TASK_ITEM_RE, (_match, prefix: string, mark: string) => {
    const checked = mark === " " ? "false" : "true";
    const span = `<span class="task-checkbox" data-checked="${checked}" data-task-index="${idx}" role="checkbox" aria-checked="${checked}" tabindex="0"></span>`;
    idx++;
    return `<li>${prefix}${span}`;
  });
}

const TS_TASK_ITEM_RE = /^(\s*[-*+]\s+)\[([ xX])\](\s)/gm;
const TS_FENCED_CODE_RE = /^(?:```|~~~)[^\n]*\n[\s\S]*?\n(?:```|~~~)[ \t]*$/gm;

function maskCodeBlocks(src: string): string {
  return src.replace(TS_FENCED_CODE_RE, (m) => m.replace(/[^\n]/g, "X"));
}

export function toggleTaskInSource(
  src: string,
  index: number,
  checked: boolean,
): string | null {
  const { rest } = extractFrontmatter(src);
  const prefixLen = src.length - rest.length;

  const masked = maskCodeBlocks(rest);
  const matches: { markIndex: number }[] = [];
  TS_TASK_ITEM_RE.lastIndex = 0;
  let m: RegExpExecArray | null = TS_TASK_ITEM_RE.exec(masked);
  while (m !== null) {
    // Group layout: [full, prefix, mark, trailing]; the mark sits at the
    // position of group 2 inside the overall match.
    const markIndex = m.index + m[1].length + 1; // skip the `[`
    matches.push({ markIndex });
    m = TS_TASK_ITEM_RE.exec(masked);
  }

  if (index < 0 || index >= matches.length) return null;

  const markPos = prefixLen + matches[index].markIndex;
  const newMark = checked ? "x" : " ";
  return src.slice(0, markPos) + newMark + src.slice(markPos + 1);
}

const MERMAID_BLOCK_RE =
  /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;

function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

async function replaceMermaidBlocks(html: string): Promise<string> {
  MERMAID_BLOCK_RE.lastIndex = 0;
  const matches: { fullMatch: string; code: string; index: number }[] = [];

  let match: RegExpExecArray | null = MERMAID_BLOCK_RE.exec(html);
  while (match !== null) {
    matches.push({
      fullMatch: match[0],
      code: unescapeHtml(match[1]),
      index: match.index,
    });
    match = MERMAID_BLOCK_RE.exec(html);
  }

  if (matches.length === 0) return html;

  const codes = matches.map((m) => m.code);
  const svgs = await renderMermaidBlocks(codes);

  // Replace in reverse order to preserve string indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const svg = svgs[i];
    if (svg !== null) {
      const { fullMatch, index, code } = matches[i];
      const encodedSource = encodeURIComponent(code);
      const replacement = `<div class="mermaid-container" data-mermaid-source="${encodedSource}">${svg}</div>`;
      html =
        html.slice(0, index) +
        replacement +
        html.slice(index + fullMatch.length);
    }
  }

  return html;
}

export async function renderMarkdown(content: string): Promise<RenderResult> {
  const shiki = await getShiki();
  const md = createMarkdownRenderer(shiki);

  const { rest, frontmatter } = extractFrontmatter(content);

  const headings = parseMarkdownHeadings(rest);

  let html = md.render(rest);

  html = injectHeadingIds(html, headings);
  html = await replaceMermaidBlocks(html);
  html = transformTaskLists(html);

  if (frontmatter) {
    html = renderFrontmatterBlock(frontmatter, md, shiki) + html;
  }

  return { html, headings };
}
