import type { ComponentPropsWithoutRef } from "react";
import {
  buildEditorUri,
  parseFilePath,
  resolveAbsolutePath,
} from "../../lib/editor-links";
import type { EditorScheme } from "../../types";
import { EditorSchemes } from "../../types";
import { CodeBlock } from "./CodeBlock";

/**
 * Creates a combined code component for react-markdown that:
 * - Routes fenced code blocks to CodeBlock (syntax highlighting)
 * - Wraps inline code containing file paths with editor links
 * - Falls back to plain <code> for non-file-path inline code
 */
export function createCodeComponent(
  editorScheme: EditorScheme,
  workingDirectory: string | null,
) {
  return function CodeComponent({
    children,
    className,
    ...props
  }: ComponentPropsWithoutRef<"code">) {
    // Fenced code blocks have className (e.g., "language-ts") or contain newlines
    if (className || String(children).includes("\n")) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }

    // Inline code — check for file path patterns
    if (editorScheme === EditorSchemes.NONE || !workingDirectory) {
      return <code {...props}>{children}</code>;
    }

    const text = typeof children === "string" ? children : "";
    if (!text) {
      return <code {...props}>{children}</code>;
    }

    const match = parseFilePath(text);
    if (!match) {
      return <code {...props}>{children}</code>;
    }

    const absolutePath = resolveAbsolutePath(match.path, workingDirectory);
    const uri = buildEditorUri(
      editorScheme,
      absolutePath,
      match.line,
      match.col,
    );

    return (
      <a href={uri} title={`Open in ${editorScheme}`} className="editor-link">
        <code {...props}>{children}</code>
      </a>
    );
  };
}
