import type { ComponentPropsWithoutRef } from "react";
import { CodeBlock } from "./CodeBlock";

/**
 * Creates a combined code component for react-markdown that:
 * - Routes fenced code blocks to CodeBlock (syntax highlighting)
 * - Falls back to plain <code> for inline code
 */
export function createCodeComponent() {
  return function CodeComponent({
    children,
    className,
    ...props
  }: ComponentPropsWithoutRef<"code">) {
    // Fenced code blocks have className (e.g., "language-ts") or contain newlines
    if (className || String(children).includes("\n")) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }

    return <code {...props}>{children}</code>;
  };
}
