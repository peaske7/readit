import { useEffect, useState } from "react";
import { MermaidDiagram } from "./MermaidDiagram";

const CODE_BLOCK_STYLE = {
  margin: "1.5em 0",
  borderRadius: "0.5em",
  fontSize: "0.875em",
};

interface SyntaxHighlighterModule {
  SyntaxHighlighter: typeof import("react-syntax-highlighter").PrismLight;
  oneDark: typeof import("react-syntax-highlighter/dist/esm/styles/prism").oneDark;
}

interface CodeBlockProps {
  className?: string;
  children?: React.ReactNode;
}

let syntaxHighlighterPromise: Promise<SyntaxHighlighterModule> | null = null;

async function loadSyntaxHighlighter(): Promise<SyntaxHighlighterModule> {
  if (syntaxHighlighterPromise) {
    return syntaxHighlighterPromise;
  }

  syntaxHighlighterPromise = Promise.all([
    import("react-syntax-highlighter"),
    import("react-syntax-highlighter/dist/esm/styles/prism"),
    import("react-syntax-highlighter/dist/esm/languages/prism/bash"),
    import("react-syntax-highlighter/dist/esm/languages/prism/css"),
    import("react-syntax-highlighter/dist/esm/languages/prism/diff"),
    import("react-syntax-highlighter/dist/esm/languages/prism/go"),
    import("react-syntax-highlighter/dist/esm/languages/prism/graphql"),
    import("react-syntax-highlighter/dist/esm/languages/prism/javascript"),
    import("react-syntax-highlighter/dist/esm/languages/prism/json"),
    import("react-syntax-highlighter/dist/esm/languages/prism/jsx"),
    import("react-syntax-highlighter/dist/esm/languages/prism/markdown"),
    import("react-syntax-highlighter/dist/esm/languages/prism/python"),
    import("react-syntax-highlighter/dist/esm/languages/prism/rust"),
    import("react-syntax-highlighter/dist/esm/languages/prism/sql"),
    import("react-syntax-highlighter/dist/esm/languages/prism/tsx"),
    import("react-syntax-highlighter/dist/esm/languages/prism/typescript"),
    import("react-syntax-highlighter/dist/esm/languages/prism/yaml"),
  ]).then(
    ([
      syntaxModule,
      styleModule,
      bash,
      css,
      diff,
      go,
      graphql,
      javascript,
      json,
      jsx,
      markdown,
      python,
      rust,
      sql,
      tsx,
      typescript,
      yaml,
    ]) => {
      const SyntaxHighlighter = syntaxModule.PrismLight;

      SyntaxHighlighter.registerLanguage("bash", bash.default);
      SyntaxHighlighter.registerLanguage("sh", bash.default);
      SyntaxHighlighter.registerLanguage("shell", bash.default);
      SyntaxHighlighter.registerLanguage("css", css.default);
      SyntaxHighlighter.registerLanguage("diff", diff.default);
      SyntaxHighlighter.registerLanguage("go", go.default);
      SyntaxHighlighter.registerLanguage("graphql", graphql.default);
      SyntaxHighlighter.registerLanguage("javascript", javascript.default);
      SyntaxHighlighter.registerLanguage("js", javascript.default);
      SyntaxHighlighter.registerLanguage("json", json.default);
      SyntaxHighlighter.registerLanguage("jsx", jsx.default);
      SyntaxHighlighter.registerLanguage("markdown", markdown.default);
      SyntaxHighlighter.registerLanguage("md", markdown.default);
      SyntaxHighlighter.registerLanguage("python", python.default);
      SyntaxHighlighter.registerLanguage("py", python.default);
      SyntaxHighlighter.registerLanguage("rust", rust.default);
      SyntaxHighlighter.registerLanguage("rs", rust.default);
      SyntaxHighlighter.registerLanguage("sql", sql.default);
      SyntaxHighlighter.registerLanguage("tsx", tsx.default);
      SyntaxHighlighter.registerLanguage("typescript", typescript.default);
      SyntaxHighlighter.registerLanguage("ts", typescript.default);
      SyntaxHighlighter.registerLanguage("yaml", yaml.default);
      SyntaxHighlighter.registerLanguage("yml", yaml.default);

      return {
        SyntaxHighlighter,
        oneDark: styleModule.oneDark,
      };
    },
  );

  return syntaxHighlighterPromise;
}

function LazySyntaxCodeBlock({
  codeString,
  language,
}: {
  codeString: string;
  language: string;
}) {
  const [module, setModule] = useState<SyntaxHighlighterModule | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadSyntaxHighlighter().then((loaded) => {
      if (!cancelled) {
        setModule(loaded);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!module) {
    return (
      <pre style={CODE_BLOCK_STYLE}>
        <code>{codeString}</code>
      </pre>
    );
  }

  const { SyntaxHighlighter, oneDark } = module;

  return (
    <SyntaxHighlighter
      style={oneDark}
      language={language}
      PreTag="div"
      customStyle={CODE_BLOCK_STYLE}
    >
      {codeString}
    </SyntaxHighlighter>
  );
}

export function CodeBlock({ className, children }: CodeBlockProps) {
  const langMatch = className?.match(/language-(\w+)/);
  const language = langMatch?.[1] ?? "";
  const codeString = String(children).replace(/\n$/, "");

  if (language === "mermaid") {
    return <MermaidDiagram code={codeString} />;
  }

  if (!langMatch && !String(children).includes("\n")) {
    return <code className={className}>{children}</code>;
  }

  return <LazySyntaxCodeBlock codeString={codeString} language={language} />;
}
