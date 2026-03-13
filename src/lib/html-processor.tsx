import type { Element, Root } from "hast";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import rehypeParse from "rehype-parse";
import rehypeReact from "rehype-react";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/**
 * Placeholder component for stripped dangerous elements
 */
function StrippedElement({ tagName }: { tagName: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-md font-mono">
      <TriangleAlert className="w-4 h-4" />
      &lt;{tagName}&gt; removed
    </span>
  );
}

/**
 * Component mappings for dangerous elements - renders placeholders instead
 */
const dangerousElementComponents = {
  script: () => <StrippedElement tagName="script" />,
  // Style tags targeting body/html/* can leak outside Shadow DOM, so strip them
  // Our base styles in ShadowContainer provide typography instead
  style: () => null,
  link: () => null, // External stylesheets break app styles
  iframe: () => <StrippedElement tagName="iframe" />,
  object: () => <StrippedElement tagName="object" />,
  embed: () => <StrippedElement tagName="embed" />,
  frame: () => <StrippedElement tagName="frame" />,
  frameset: () => <StrippedElement tagName="frameset" />,
};

/**
 * Rehype plugin to strip event handler attributes (onclick, onerror, etc.)
 * and dangerous href/src values (javascript:, data:, vbscript:)
 */
function rehypeStripDangerousAttributes() {
  const dangerousSchemes = /^(javascript|vbscript|data):/i;

  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const props = node.properties;
      if (!props) return;

      for (const key of Object.keys(props)) {
        // Strip all event handlers (on*)
        if (key.startsWith("on") || key.startsWith("On")) {
          delete props[key];
          continue;
        }

        // Neutralize dangerous href/src schemes
        if (key === "href" || key === "src") {
          const value = props[key];
          if (
            typeof value === "string" &&
            dangerousSchemes.test(value.trim())
          ) {
            props[key] = "#";
          }
        }
      }
    });
  };
}

/**
 * Create the unified processor for HTML -> React conversion
 */
const processor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeStripDangerousAttributes)
  .use(rehypeReact, {
    jsx,
    jsxs,
    Fragment,
    components: dangerousElementComponents,
  });

/**
 * Process HTML content and return safe React elements
 *
 * - Dangerous tags (script, iframe, etc.) become visible placeholders
 * - Event handlers (onclick, onerror, etc.) are stripped
 * - Dangerous URLs (javascript:, data:, etc.) are neutralized
 */
export function processHtml(content: string): ReactNode {
  const result = processor.processSync(content);
  return result.result as ReactNode;
}
