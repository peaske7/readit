package server

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	mrand "math/rand"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// The .comments.md format is shared with the TypeScript codec in
// src/lib/comment-storage.ts. Both must parse the same files identically and
// serialize the same comments byte-for-byte; fixtures/comments/ is the shared
// conformance corpus, and src/lib/comment-storage.ts documents the invariants.
var (
	frontMatterRe       = regexp.MustCompile(`(?s)^---\n(.*?)\n---`)
	frontMatterStripRe  = regexp.MustCompile(`(?s)^---\n.*?\n---\n*`)
	commentMetaRe       = regexp.MustCompile(`<!--\s*c:([^|]+)\|([^|>\s]+)(?:\|([^>]*))?\s*-->`)
	anchorPrefixRe      = regexp.MustCompile(`<!--\s*anchor:(.*?)\s*-->`)
	trailingSeparatorRe = regexp.MustCompile(`\n+---\s*$`)
	base64AnchorRe      = regexp.MustCompile(`^[A-Za-z0-9+/]+={0,2}$`)

	// The anchor prefix is stored as readable text on one line, so newlines,
	// backslashes and a literal "-->" are backslash-escaped.
	anchorEscaper   = strings.NewReplacer(`\`, `\\`, "\n", `\n`, "\r", `\r`, "-->", `--\>`)
	anchorUnescaper = strings.NewReplacer(`\\`, `\`, `\n`, "\n", `\r`, "\r", `\>`, ">")
)

// decodeAnchorPrefix reads a stored anchor prefix. readit <= 0.4 base64-encoded
// it here; raw text is only ambiguous with base64 when it is pure base64
// alphabet, correctly padded and decodes to printable UTF-8, so that
// combination is read as legacy.
func decodeAnchorPrefix(raw string) string {
	if len(raw)%4 == 0 && base64AnchorRe.MatchString(raw) {
		decoded, err := base64.StdEncoding.DecodeString(raw)
		if err == nil && len(decoded) > 0 && utf8.Valid(decoded) && isPrintable(string(decoded)) {
			return string(decoded)
		}
	}
	return anchorUnescaper.Replace(raw)
}

func isPrintable(s string) bool {
	for _, r := range s {
		if unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' {
			return false
		}
	}
	return true
}

func CommentPath(filePath string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("cannot determine home directory: %w", err)
	}
	abs, err := filepath.Abs(filePath)
	if err != nil {
		return "", fmt.Errorf("cannot resolve absolute path for %s: %w", filePath, err)
	}

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

	return filepath.Join(home, ".readit", "comments", stripped+".comments.md"), nil
}

func ComputeHash(content []byte) string {
	h := sha256.Sum256(content)
	return fmt.Sprintf("%x", h[:])[:HashLength]
}

func ParseCommentFile(data []byte) (CommentFile, error) {
	content := string(data)
	cf := CommentFile{Version: FormatVersion}

	if fm := frontMatterRe.FindStringSubmatch(content); len(fm) > 1 {
		for line := range strings.SplitSeq(fm[1], "\n") {
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

func parseCommentBlock(rawBlock string) (Comment, bool) {
	block := strings.TrimSpace(trailingSeparatorRe.ReplaceAllString(strings.TrimSpace(rawBlock), ""))

	meta := commentMetaRe.FindStringSubmatch(block)
	if meta == nil {
		return Comment{}, false
	}

	c := Comment{
		ID:        strings.TrimSpace(meta[1]),
		LineHint:  strings.TrimSpace(meta[2]),
		CreatedAt: strings.TrimSpace(meta[3]),
	}
	if ap := anchorPrefixRe.FindStringSubmatch(block); ap != nil {
		c.AnchorPrefix = decodeAnchorPrefix(ap[1])
	}

	lines := strings.Split(block, "\n")
	i := 0
	for i < len(lines) && (commentMetaRe.MatchString(lines[i]) || anchorPrefixRe.MatchString(lines[i])) {
		i++
	}

	var selected []string
	for ; i < len(lines); i++ {
		if lines[i] == ">" {
			selected = append(selected, "")
		} else if strings.HasPrefix(lines[i], "> ") {
			selected = append(selected, lines[i][2:])
		} else {
			break
		}
	}
	if len(selected) == 0 {
		return Comment{}, false
	}

	c.SelectedText = strings.Join(selected, "\n")
	c.Comment = strings.TrimSpace(strings.Join(lines[i:], "\n"))

	return c, true
}

// frontMatterLine never leaves a trailing space behind an empty value.
func frontMatterLine(key, value string) string {
	if value == "" {
		return key + ":"
	}
	return key + ": " + value
}

func SerializeComments(cf CommentFile) []byte {
	lines := []string{
		"---",
		frontMatterLine("source", cf.Source),
		frontMatterLine("hash", cf.Hash),
		fmt.Sprintf("version: %d", cf.Version),
		"---",
		"",
	}

	for _, c := range cf.Comments {
		lineHint := c.LineHint
		if lineHint == "" {
			lineHint = "L0"
		}
		if c.CreatedAt == "" {
			lines = append(lines, fmt.Sprintf("<!-- c:%s|%s -->", c.ID, lineHint))
		} else {
			lines = append(lines, fmt.Sprintf("<!-- c:%s|%s|%s -->", c.ID, lineHint, c.CreatedAt))
		}

		if c.AnchorPrefix != "" {
			lines = append(lines, fmt.Sprintf("<!-- anchor:%s -->", anchorEscaper.Replace(c.AnchorPrefix)))
		}

		for line := range strings.SplitSeq(c.SelectedText, "\n") {
			if line == "" {
				lines = append(lines, ">")
			} else {
				lines = append(lines, "> "+line)
			}
		}

		if body := strings.TrimSpace(c.Comment); body != "" {
			lines = append(lines, "", body)
		}

		lines = append(lines, "", "---", "")
	}

	return []byte(strings.Join(lines, "\n"))
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
	if _, err := rand.Read(b); err != nil {
		fallback := mrand.New(mrand.NewSource(time.Now().UnixNano()))
		for i := range b {
			b[i] = byte(fallback.Intn(256))
		}
	}
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
