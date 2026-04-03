package server

import (
	"encoding/json"
	"html/template"
	"strings"
)

type TemplateData struct {
	Title        string
	CSSPath      string
	JSPath       string
	DocumentHTML template.HTML
	InlineJSON   template.JS
	IsDev        bool
	FontFamily   string
	ProseClass   string
	ViteClient   template.HTML
}

const pageTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>readit — {{.Title}}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>📖</text></svg>">
  <script>
    (() => {
      var t = localStorage.getItem("readit:theme");
      var d = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
      if (d) document.documentElement.classList.add("dark");
    })();
  </script>
  {{.ViteClient}}
  {{if .CSSPath}}<link rel="stylesheet" href="{{.CSSPath}}">{{end}}
</head>
<body class="min-h-screen">
  <article id="document-content" class="prose {{.ProseClass}}">{{.DocumentHTML}}</article>
  <div id="app"></div>
  <script type="application/json" id="__readit">{{.InlineJSON}}</script>
  <script type="module" src="{{.JSPath}}"></script>
</body>
</html>`

func CompileTemplate() *template.Template {
	return template.Must(template.New("page").Parse(pageTemplate))
}

func RenderPage(tmpl *template.Template, data TemplateData) (string, error) {
	var b strings.Builder
	if err := tmpl.Execute(&b, data); err != nil {
		return "", err
	}
	return b.String(), nil
}

// SafeJSONStringify serializes data for embedding in a <script> tag.
func SafeJSONStringify(data any) (template.JS, error) {
	b, err := json.Marshal(data)
	if err != nil {
		return "", err
	}
	s := strings.ReplaceAll(string(b), "<", `\u003c`)
	return template.JS(s), nil
}
