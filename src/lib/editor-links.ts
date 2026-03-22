import { type EditorScheme, EditorSchemes } from "../types";

// Known source file extensions — kept broad to cover common languages
const EXTENSIONS =
  "ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|htm|py|rs|go|rb|java|kt|yml|yaml|toml|sh|bash|zsh|sql|graphql|gql|vue|svelte|astro|c|cpp|h|hpp|cs|swift|zig|lua|ex|exs|erl|hrl|elm|clj|cljs|ml|mli|fs|fsx|r|jl|dart|tf|hcl|proto|xml|svg";

// Match file paths with known extensions and optional :line[:col] suffix
// Requires at least one `/` to avoid matching bare filenames like "README.md"
const FILE_PATH_RE = new RegExp(
  `^(?:\\.\\.\\/|\\.\\/)?((?:[\\w@.-]+\\/)+[\\w.-]+\\.(?:${EXTENSIONS}))(?::(\\d+)(?::(\\d+))?)?$`,
);

export interface FilePathMatch {
  path: string;
  line?: number;
  col?: number;
}

export function parseFilePath(text: string): FilePathMatch | undefined {
  const match = FILE_PATH_RE.exec(text.trim());
  if (!match) return undefined;

  return {
    path: match[1],
    line: match[2] ? Number.parseInt(match[2], 10) : undefined,
    col: match[3] ? Number.parseInt(match[3], 10) : undefined,
  };
}

export function buildEditorUri(
  scheme: EditorScheme,
  absolutePath: string,
  line?: number,
  col?: number,
): string {
  if (scheme === EditorSchemes.NONE) return "";

  // vscode://file/path:line:col
  let uri = `${scheme}://file/${absolutePath}`;
  if (line !== undefined) {
    uri += `:${line}`;
    if (col !== undefined) {
      uri += `:${col}`;
    }
  }
  return uri;
}

export function resolveAbsolutePath(
  relativePath: string,
  workingDirectory: string,
): string {
  if (relativePath.startsWith("/")) return relativePath;

  const base = workingDirectory.endsWith("/")
    ? workingDirectory
    : `${workingDirectory}/`;
  return `${base}${relativePath}`;
}
