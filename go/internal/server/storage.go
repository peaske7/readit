package server

import (
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	frontMatterRe      = regexp.MustCompile(`(?s)^---\n(.*?)\n---`)
	frontMatterStripRe = regexp.MustCompile(`(?s)^---\n.*?\n---\n*`)
	commentMetaRe      = regexp.MustCompile(`<!--\s*c:([^|]+)\|([^|]+)\|([^>]+)\s*-->`)
	anchorPrefixRe     = regexp.MustCompile(`<!--\s*anchor:(.+?)\s*-->`)
	blockquoteRe       = regexp.MustCompile(`(?m)^>\s?(.*)`)
)

func CommentPath(filePath string) string {
	home, _ := os.UserHomeDir()
	abs, _ := filepath.Abs(filePath)

	stripped := abs
	if runtime.GOOS == "windows" {
		if len(stripped) >= 2 && stripped[1] == ':' {
			stripped = stripped[2:]
		}
	}
	stripped = strings.TrimPrefix(stripped, "/")

	ext := filepath.Ext(stripped)
	if ext != "" {
		stripped = stripped[:len(stripped)-len(ext)]
	}

	return filepath.Join(home, ".readit", "comments", stripped+".comments.md")
}

func ComputeHash(content []byte) string {
	h := sha256.Sum256(content)
	return fmt.Sprintf("%x", h[:])[:HashLength]
}

func ParseCommentFile(data []byte) (CommentFile, error) {
	content := string(data)
	cf := CommentFile{Version: FormatVersion}

	if fm := frontMatterRe.FindStringSubmatch(content); len(fm) > 1 {
		for _, line := range strings.Split(fm[1], "\n") {
			line = strings.TrimSpace(line)
			if k, v, ok := strings.Cut(line, ":"); ok {
				v = strings.TrimSpace(v)
				switch strings.TrimSpace(k) {
				case "source":
					cf.Source = v
				case "hash":
					cf.Hash = v
				case "version":
					_, _ = fmt.Sscanf(v, "%d", &cf.Version)
				}
			}
		}
	}

	body := frontMatterStripRe.ReplaceAllString(content, "")
	body = strings.TrimSpace(body)
	if body == "" {
		return cf, nil
	}

	markers := commentMetaRe.FindAllStringIndex(body, -1)
	for i, loc := range markers {
		var block string
		if i+1 < len(markers) {
			block = body[loc[0]:markers[i+1][0]]
		} else {
			block = body[loc[0]:]
		}
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}
		if c, ok := parseCommentBlock(block); ok {
			cf.Comments = append(cf.Comments, c)
		}
	}

	return cf, nil
}

func parseCommentBlock(block string) (Comment, bool) {
	meta := commentMetaRe.FindStringSubmatch(block)
	if meta == nil {
		return Comment{}, false
	}

	c := Comment{
		ID:        strings.TrimSpace(meta[1]),
		LineHint:  strings.TrimSpace(meta[2]),
		CreatedAt: strings.TrimSpace(meta[3]),
	}

	// Optional anchor prefix
	if ap := anchorPrefixRe.FindStringSubmatch(block); len(ap) > 1 {
		c.AnchorPrefix = strings.TrimSpace(ap[1])
	}

	bqMatches := blockquoteRe.FindAllStringSubmatch(block, -1)
	if len(bqMatches) > 0 {
		lines := make([]string, len(bqMatches))
		for i, m := range bqMatches {
			lines[i] = m[1]
		}
		c.SelectedText = strings.Join(lines, "\n")
	}

	bodyLines := strings.Split(block, "\n")
	inBlockquote := false
	pastBlockquote := false
	var commentLines []string

	for _, line := range bodyLines {
		if commentMetaRe.MatchString(line) || anchorPrefixRe.MatchString(line) {
			continue
		}
		if strings.HasPrefix(line, "> ") || line == ">" {
			inBlockquote = true
			continue
		}
		if inBlockquote && !pastBlockquote {
			pastBlockquote = true
			if strings.TrimSpace(line) == "" {
				continue
			}
		}
		if pastBlockquote {
			commentLines = append(commentLines, line)
		}
	}
	comment := strings.TrimSpace(strings.Join(commentLines, "\n"))
	comment = strings.TrimRight(comment, "\n")
	if strings.HasSuffix(comment, "\n---") {
		comment = strings.TrimSpace(comment[:len(comment)-4])
	} else if comment == "---" {
		comment = ""
	}
	c.Comment = comment

	return c, true
}

func SerializeComments(cf CommentFile) []byte {
	var b strings.Builder

	b.WriteString("---\n")
	b.WriteString("source: " + cf.Source + "\n")
	b.WriteString("hash: " + cf.Hash + "\n")
	fmt.Fprintf(&b, "version: %d\n", cf.Version)
	b.WriteString("---\n\n")

	for i, c := range cf.Comments {
		fmt.Fprintf(&b, "<!-- c:%s|%s|%s -->\n", c.ID, c.LineHint, c.CreatedAt)

		if c.AnchorPrefix != "" {
			fmt.Fprintf(&b, "<!-- anchor:%s -->\n", c.AnchorPrefix)
		}

		for _, line := range strings.Split(c.SelectedText, "\n") {
			b.WriteString("> " + line + "\n")
		}

		b.WriteString("\n")
		b.WriteString(c.Comment)
		b.WriteString("\n")

		if i < len(cf.Comments)-1 {
			b.WriteString("\n---\n\n")
		}
	}

	return []byte(b.String())
}

func WriteCommentFile(path string, cf CommentFile) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, SerializeComments(cf), 0644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func TruncateSelection(text string) string {
	if utf8.RuneCountInString(text) <= MaxSelectionLength {
		return text
	}
	runes := []rune(text)
	half := (MaxSelectionLength - utf8.RuneCountInString(TruncationMarker)) / 2
	return string(runes[:half]) + TruncationMarker + string(runes[len(runes)-half:])
}

func GetLineNumber(content string, offset int) int {
	if offset <= 0 {
		return 1
	}
	if offset > len(content) {
		offset = len(content)
	}
	return strings.Count(content[:offset], "\n") + 1
}

func GetLineHint(content string, startOffset, endOffset int) string {
	startLine := GetLineNumber(content, startOffset)
	endLine := GetLineNumber(content, endOffset)
	if startLine == endLine {
		return fmt.Sprintf("L%d", startLine)
	}
	return fmt.Sprintf("L%d-L%d", startLine, endLine)
}

func NewCommentID() string {
	b := make([]byte, 4)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

func CreateComment(selectedText, commentText string, startOffset, endOffset int, sourceContent string) Comment {
	truncated := TruncateSelection(selectedText)
	c := Comment{
		ID:           NewCommentID(),
		SelectedText: truncated,
		Comment:      strings.TrimSpace(commentText),
		CreatedAt:    time.Now().UTC().Format(time.RFC3339Nano),
		StartOffset:  startOffset,
		EndOffset:    endOffset,
		LineHint:     GetLineHint(sourceContent, startOffset, endOffset),
	}
	if utf8.RuneCountInString(selectedText) > MaxSelectionLength {
		runes := []rune(selectedText)
		c.AnchorPrefix = string(runes[:min(AnchorPrefixLength, len(runes))])
	}
	return c
}
