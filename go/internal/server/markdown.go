package server

import (
	"bytes"
	"fmt"
	htmlpkg "html"
	"regexp"
	"strings"

	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
)

type RenderResult struct {
	HTML     string
	Headings []Heading
}

type Renderer struct {
	md       goldmark.Markdown
	sanitize *bluemonday.Policy
}

func NewRenderer() *Renderer {
	// Allow raw HTML through goldmark, but sanitize to strip dangerous elements.
	p := bluemonday.UGCPolicy()
	p.AllowAttrs("class").Globally()
	p.AllowAttrs("id").Globally()
	p.AllowAttrs("style").Globally()
	p.AllowElements("details", "summary", "pre", "code", "span")
	p.AllowAttrs("open").OnElements("details")
	p.AllowAttrs("data-mermaid-placeholder").OnElements("div")

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
		sanitize: p,
	}
}

var mermaidFenceRe = regexp.MustCompile("(?m)^```mermaid\\s*\n([\\s\\S]*?)^```\\s*$")

// Render converts markdown source to HTML and extracts headings.
// Mermaid fenced blocks are extracted before rendering so chroma doesn't
// consume them, then re-injected as <pre><code class="language-mermaid">.
func (r *Renderer) Render(source []byte) (RenderResult, error) {
	content := string(source)

	var mermaidBlocks []string
	processed := mermaidFenceRe.ReplaceAllStringFunc(content, func(match string) string {
		sub := mermaidFenceRe.FindStringSubmatch(match)
		code := strings.TrimSpace(sub[1])
		idx := len(mermaidBlocks)
		mermaidBlocks = append(mermaidBlocks, code)
		return fmt.Sprintf(`<div data-mermaid-placeholder="%d"></div>`, idx)
	})

	processedBytes := []byte(processed)

	// Parse into AST so we can extract headings with correct IDs
	reader := text.NewReader(processedBytes)
	doc := r.md.Parser().Parse(reader)

	// Extract headings from the AST (IDs match rendered HTML exactly)
	headings := extractHeadingsFromAST(doc, processedBytes)

	// Render the AST to HTML
	var buf bytes.Buffer
	if err := r.md.Renderer().Render(&buf, processedBytes, doc); err != nil {
		return RenderResult{}, fmt.Errorf("goldmark render: %w", err)
	}
	output := buf.String()

	output = r.sanitize.Sanitize(output)

	// Restore mermaid blocks (after sanitization since they use escaped content)
	for i, code := range mermaidBlocks {
		placeholder := fmt.Sprintf(`<div data-mermaid-placeholder="%d"></div>`, i)
		replacement := fmt.Sprintf(`<pre><code class="language-mermaid">%s</code></pre>`, htmlpkg.EscapeString(code))
		output = strings.Replace(output, placeholder, replacement, 1)
	}

	return RenderResult{HTML: output, Headings: headings}, nil
}

// extractHeadingsFromAST walks the goldmark AST to collect heading nodes.
// This produces IDs that match the rendered HTML exactly (via WithAutoHeadingID).
func extractHeadingsFromAST(doc ast.Node, source []byte) []Heading {
	var headings []Heading

	_ = ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering || n.Kind() != ast.KindHeading {
			return ast.WalkContinue, nil
		}
		h := n.(*ast.Heading)

		var id string
		if raw, ok := h.AttributeString("id"); ok {
			if b, isByte := raw.([]byte); isByte {
				id = string(b)
			}
		}

		// Collect plain text from all inline children recursively
		var textBuf bytes.Buffer
		collectText(h, source, &textBuf)

		headings = append(headings, Heading{
			ID:    id,
			Text:  strings.TrimSpace(textBuf.String()),
			Level: h.Level,
		})

		return ast.WalkSkipChildren, nil
	})

	return headings
}

// collectText recursively collects plain text from AST nodes.
func collectText(n ast.Node, source []byte, buf *bytes.Buffer) {
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		if t, ok := c.(*ast.Text); ok {
			buf.Write(t.Segment.Value(source))
			if t.SoftLineBreak() {
				buf.WriteByte(' ')
			}
		} else {
			collectText(c, source, buf)
		}
	}
}
