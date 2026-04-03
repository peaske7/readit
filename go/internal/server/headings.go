package server

import (
	"bytes"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
)

// ExtractHeadings parses markdown source and returns headings using goldmark's AST.
// This ensures heading IDs match exactly what goldmark renders in HTML.
func ExtractHeadings(source []byte) []Heading {
	md := goldmark.New(
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
		),
	)

	reader := text.NewReader(source)
	doc := md.Parser().Parse(reader)

	return extractHeadingsFromAST(doc, source)
}

// collectHeadingText recursively collects plain text from heading AST nodes.
func collectHeadingText(n ast.Node, source []byte) string {
	var buf bytes.Buffer
	collectText(n, source, &buf)
	return strings.TrimSpace(buf.String())
}
