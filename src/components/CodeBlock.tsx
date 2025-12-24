import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
  // Extract language from className (e.g., "language-typescript" -> "typescript")
  const langMatch = className?.match(/language-(\w+)/);
  const language = langMatch?.[1] ?? "";
  const codeString = String(children).replace(/\n$/, "");

  // Inline code (no language specified and no newlines)
  if (!langMatch && !String(children).includes("\n")) {
    return <code className={className}>{children}</code>;
  }

  return (
    <SyntaxHighlighter
      style={oneDark}
      language={language}
      PreTag="div"
      customStyle={{
        margin: "1.5em 0",
        borderRadius: "0.5em",
        fontSize: "0.875em",
      }}
    >
      {codeString}
    </SyntaxHighlighter>
  );
}
