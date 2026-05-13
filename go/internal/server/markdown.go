package server

import (
	"bytes"
	"fmt"
	htmlpkg "html"
	"regexp"
	"strings"
	"sync"

	"github.com/alecthomas/chroma/v2"
	chromahtml "github.com/alecthomas/chroma/v2/formatters/html"
	"github.com/alecthomas/chroma/v2/lexers"
	"github.com/alecthomas/chroma/v2/styles"
	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	highlighting "github.com/yuin/goldmark-highlighting/v2"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	eastext "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

type RenderResult struct {
	HTML     string
	Headings []Heading
}

type Renderer struct {
	md       goldmark.Markdown
	sanitize *bluemonday.Policy
	taskR    *taskCheckBoxRenderer
	mu       sync.Mutex
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
	p.AllowAttrs("data-checked", "data-task-index").OnElements("span", "li")
	p.AllowAttrs("role", "aria-checked", "tabindex").OnElements("span")

	taskR := &taskCheckBoxRenderer{}
	md := goldmark.New(
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
			html.WithHardWraps(),
			renderer.WithNodeRenderers(
				util.Prioritized(taskR, 100),
			),
		),
	)

	return &Renderer{md: md, sanitize: p, taskR: taskR}
}

// taskCheckBoxRenderer replaces goldmark's default <input type="checkbox">
// with a styleable <span class="task-checkbox" data-checked="..."></span>.
// Real disabled inputs are awkward to style consistently; a semantic span
// gives us full control via CSS while preserving the GFM data via data-checked.
// The data-task-index attribute lets the client toggle a specific task without
// re-counting on the server.
type taskCheckBoxRenderer struct {
	idx int
}

func (r *taskCheckBoxRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(eastext.KindTaskCheckBox, r.renderTaskCheckBox)
}

func (r *taskCheckBoxRenderer) renderTaskCheckBox(w util.BufWriter, source []byte, node ast.Node, entering bool) (ast.WalkStatus, error) {
	if !entering {
		return ast.WalkContinue, nil
	}
	n := node.(*eastext.TaskCheckBox)
	checked := "false"
	if n.IsChecked {
		checked = "true"
	}
	_, _ = fmt.Fprintf(w, `<span class="task-checkbox" data-checked="%s" data-task-index="%d" role="checkbox" aria-checked="%s" tabindex="0"></span>`, checked, r.idx, checked)
	r.idx++
	return ast.WalkContinue, nil
}

var mermaidFenceRe = regexp.MustCompile("(?m)^```mermaid\\s*\n([\\s\\S]*?)^```\\s*$")

// Matches YAML/TOML-style frontmatter at the very start of a document:
//
//	---
//	key: value
//	---
//
// Obsidian, Jekyll, and many static-site generators use this convention.
// Without special handling, the leading `---` becomes a thematic break and
// the body gets parsed as ordinary markdown, producing garbage.
var frontmatterRe = regexp.MustCompile(`\A---\r?\n([\s\S]*?)\r?\n---\r?\n?`)

// extractFrontmatter strips a leading YAML frontmatter block from src and
// returns the inner content (without the --- fences). If no frontmatter is
// present, the second return value is empty.
func extractFrontmatter(src string) (rest string, frontmatter string) {
	match := frontmatterRe.FindStringSubmatchIndex(src)
	if match == nil {
		return src, ""
	}
	inner := src[match[2]:match[3]]
	return src[match[1]:], strings.TrimSpace(inner)
}

// GFM task list item: bullet (`-`, `*`, `+`), optional indent, `[ ]` or `[x]`,
// followed by whitespace. Goldmark's TaskList parser uses the same shape.
var taskItemRe = regexp.MustCompile(`(?m)^(\s*[-*+]\s+)\[([ xX])\](\s)`)

// fencedCodeRe matches fenced code blocks so we can mask them out and avoid
// toggling `- [ ]` patterns that appear inside code samples.
var fencedCodeRe = regexp.MustCompile("(?ms)^(?:```|~~~)[^\n]*\n.*?\n(?:```|~~~)[ \t]*$")

// maskCodeBlocks replaces fenced code block contents with `X` characters of
// equal length, preserving newlines, so byte offsets stay aligned but task
// patterns inside the blocks no longer match.
func maskCodeBlocks(src string) string {
	return fencedCodeRe.ReplaceAllStringFunc(src, func(m string) string {
		out := make([]byte, len(m))
		for i := 0; i < len(m); i++ {
			if m[i] == '\n' {
				out[i] = '\n'
			} else {
				out[i] = 'X'
			}
		}
		return string(out)
	})
}

// ToggleTaskInSource flips the Nth task list item's mark between ` ` and `x`.
// The index is 0-based and counts task items in the same order goldmark renders
// them. Frontmatter and fenced code blocks are excluded so the index always
// matches what the user sees.
//
// Returns the modified source and true on success; returns "" and false if the
// index is out of range.
func ToggleTaskInSource(src string, index int, checked bool) (string, bool) {
	rest, _ := extractFrontmatter(src)
	prefixLen := len(src) - len(rest)

	masked := maskCodeBlocks(rest)
	matches := taskItemRe.FindAllStringSubmatchIndex(masked, -1)
	if index < 0 || index >= len(matches) {
		return "", false
	}

	// FindAllStringSubmatchIndex returns flat pairs: full match, group 1, group 2...
	// Group 2 (the mark character) is at indices [4]:[5].
	markStart := matches[index][4]
	markEnd := matches[index][5]

	newMark := byte(' ')
	if checked {
		newMark = 'x'
	}

	absStart := prefixLen + markStart
	absEnd := prefixLen + markEnd
	return src[:absStart] + string(newMark) + src[absEnd:], true
}

// Render converts markdown source to HTML and extracts headings.
// Mermaid fenced blocks are extracted before rendering so chroma doesn't
// consume them, then re-injected as <pre><code class="language-mermaid">.
func (r *Renderer) Render(source []byte) (RenderResult, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	content := string(source)

	rest, frontmatter := extractFrontmatter(content)
	if frontmatter != "" {
		content = rest
	}

	r.taskR.idx = 0

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

	if frontmatter != "" {
		output = renderFrontmatterBlock(frontmatter) + output
	}

	return RenderResult{HTML: output, Headings: headings}, nil
}

var (
	yamlLexer = lexers.Get("yaml")
	yamlStyle = func() *chroma.Style {
		s := styles.Get("onedark")
		if s == nil {
			return styles.Fallback
		}
		return s
	}()
	// Inline styles (not classes) so the frontmatter renders correctly
	// without depending on a separate chroma stylesheet.
	yamlFormatter = chromahtml.New(chromahtml.WithClasses(false))
)

func highlightYAML(src string) (string, error) {
	if yamlLexer == nil {
		return "", fmt.Errorf("yaml lexer unavailable")
	}
	iter, err := yamlLexer.Tokenise(nil, src)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := yamlFormatter.Format(&buf, yamlStyle, iter); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// renderFrontmatterBlock wraps frontmatter content in a collapsed <details>
// block. The body is rendered as a yaml code block so chroma can highlight it.
// We render the highlighted HTML directly so we can prepend the block after
// sanitization (avoiding double-sanitization of the input).
func renderFrontmatterBlock(yamlSource string) string {
	highlighted, err := highlightYAML(yamlSource)
	if err != nil || highlighted == "" {
		highlighted = fmt.Sprintf(`<pre><code class="language-yaml">%s</code></pre>`, htmlpkg.EscapeString(yamlSource))
	}
	return fmt.Sprintf(`<details class="frontmatter"><summary>Properties</summary>%s</details>`, highlighted)
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
