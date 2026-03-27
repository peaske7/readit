package server

import (
	"fmt"
	"strings"
	"testing"
)

func generateMarkdown(lines int) []byte {
	var b strings.Builder
	b.WriteString("# Document Title\n\n")
	for i := 0; i < lines; i++ {
		switch i % 10 {
		case 0:
			b.WriteString(fmt.Sprintf("## Section %d\n\n", i/10))
		case 5:
			b.WriteString("```go\nfunc hello() {\n\tfmt.Println(\"world\")\n}\n```\n\n")
		default:
			b.WriteString(fmt.Sprintf("This is paragraph %d with some **bold** and *italic* text. ", i))
			b.WriteString("It contains [links](https://example.com) and `inline code`.\n\n")
		}
	}
	return []byte(b.String())
}

func BenchmarkRender1000Lines(b *testing.B) {
	r := NewRenderer()
	src := generateMarkdown(1000)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		r.Render(src)
	}
}

func BenchmarkRender3000Lines(b *testing.B) {
	r := NewRenderer()
	src := generateMarkdown(3000)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		r.Render(src)
	}
}
