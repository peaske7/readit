package server

import (
	"bytes"
	"fmt"
	htmlpkg "html"
	"regexp"
	"strings"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
)

// RenderResult holds the output of rendering a markdown document.
type RenderResult struct {
	HTML     string
	Headings []Heading
}

// Renderer converts markdown source to HTML with syntax highlighting.
type Renderer struct {
	md goldmark.Markdown
}

// NewRenderer creates a Renderer with goldmark + chroma configured.
func NewRenderer() *Renderer {
	return &Renderer{
		md: goldmark.New(
			goldmark.WithExtensions(
				extension.GFM,
				extension.TaskList,
				highlighting.NewHighlighting(
					highlighting.WithStyle("onedark"),
					highlighting.WithGuessLanguage(true),
					highlighting.WithFormatOptions(
						chromahtml.WithClasses(true),
						chromahtml.WithLineNumbers(false),
					),
				),
			),
			goldmark.WithParserOptions(
				parser.WithAutoHeadingID(),
			),
			goldmark.WithRendererOptions(
				html.WithUnsafe(),
			),
		),
	}
}

var mermaidFenceRe = regexp.MustCompile("(?m)^```mermaid\\s*\n([\\s\\S]*?)^```\\s*$")

// Render converts markdown source to HTML and extracts headings.
// Mermaid fenced blocks are extracted before rendering so chroma doesn't
// consume them, then re-injected as <pre><code class="language-mermaid">.
func (r *Renderer) Render(source []byte) RenderResult {
	content := string(source)

	// Extract mermaid blocks, replace with placeholders
	var mermaidBlocks []string
	processed := mermaidFenceRe.ReplaceAllStringFunc(content, func(match string) string {
		sub := mermaidFenceRe.FindStringSubmatch(match)
		code := strings.TrimSpace(sub[1])
		idx := len(mermaidBlocks)
		mermaidBlocks = append(mermaidBlocks, code)
		return fmt.Sprintf("<!--mermaid-placeholder-%d-->", idx)
	})

	var buf bytes.Buffer
	_ = r.md.Convert([]byte(processed), &buf)
	output := buf.String()

	// Restore mermaid blocks
	for i, code := range mermaidBlocks {
		placeholder := fmt.Sprintf("<!--mermaid-placeholder-%d-->", i)
		replacement := fmt.Sprintf(`<pre><code class="language-mermaid">%s</code></pre>`, htmlpkg.EscapeString(code))
		output = strings.Replace(output, placeholder, replacement, 1)
	}

	headings := ExtractHeadings(source)
	return RenderResult{HTML: output, Headings: headings}
}
