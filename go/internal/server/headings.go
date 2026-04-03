package server

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

var (
	headingRe = regexp.MustCompile(`(?m)^(#{1,6})\s+(.+)$`)
	dashesRe  = regexp.MustCompile(`-+`)
)

// ExtractHeadings parses markdown source and returns all headings with slugified IDs.
func ExtractHeadings(source []byte) []Heading {
	content := stripCodeBlocks(string(source))

	matches := headingRe.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}

	seen := make(map[string]int)
	headings := make([]Heading, 0, len(matches))

	for _, m := range matches {
		level := len(m[1])
		text := strings.TrimSpace(m[2])
		baseID := slugify(text)

		id := baseID
		if count, exists := seen[baseID]; exists {
			id = fmt.Sprintf("%s-%d", baseID, count)
			seen[baseID] = count + 1
		} else {
			seen[baseID] = 1
		}

		headings = append(headings, Heading{
			ID:    id,
			Text:  text,
			Level: level,
		})
	}

	return headings
}

// stripCodeBlocks removes fenced code blocks from markdown content.
// Go's regexp doesn't support backreferences, so we do this iteratively.
func stripCodeBlocks(content string) string {
	var result strings.Builder
	lines := strings.Split(content, "\n")
	inFenced := false
	var fence string

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if !inFenced {
			// Check for fence open
			if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
				inFenced = true
				fence = trimmed[:3]
				continue
			}
			result.WriteString(line)
			result.WriteByte('\n')
		} else {
			// Check for fence close
			if strings.HasPrefix(trimmed, fence) && strings.TrimLeft(trimmed, string(fence[0])) == "" {
				inFenced = false
				fence = ""
			}
		}
	}

	return result.String()
}

func slugify(text string) string {
	s := strings.ToLower(strings.TrimSpace(text))
	var b strings.Builder
	for _, c := range s {
		if unicode.IsLetter(c) || unicode.IsDigit(c) {
			b.WriteRune(c)
		} else if unicode.IsSpace(c) || c == '-' {
			b.WriteRune('-')
		}
		// Drop everything else (punctuation, symbols, etc.)
	}
	s = dashesRe.ReplaceAllString(b.String(), "-")
	s = strings.Trim(s, "-")
	return s
}
