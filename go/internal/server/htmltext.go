package server

import (
	"regexp"
	"strconv"
	"strings"
)

var (
	htmlTagRe = regexp.MustCompile(`<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*\/?>`)
	entityRe  = regexp.MustCompile(`&(?:#(\d+)|#x([0-9a-fA-F]+)|(\w+));`)
)

var blockElements = map[string]bool{
	"p": true, "div": true, "h1": true, "h2": true, "h3": true,
	"h4": true, "h5": true, "h6": true, "pre": true, "blockquote": true,
	"li": true, "tr": true, "br": true,
}

var namedEntities = map[string]string{
	"amp": "&", "lt": "<", "gt": ">", "quot": `"`,
	"apos": "'", "nbsp": "\u00a0",
}

// ExtractTextFromHTML strips HTML tags and returns plain text content.
func ExtractTextFromHTML(html string) string {
	var b strings.Builder
	lastPos := 0
	prevWasBlock := false

	for _, loc := range htmlTagRe.FindAllStringIndex(html, -1) {
		// Text before this tag
		text := html[lastPos:loc[0]]
		decoded := decodeEntities(text)
		if decoded != "" {
			if prevWasBlock && b.Len() > 0 {
				b.WriteByte('\n')
			}
			b.WriteString(decoded)
			prevWasBlock = false
		}

		// Check if this tag is a block element
		tag := htmlTagRe.FindStringSubmatch(html[loc[0]:loc[1]])
		if len(tag) > 1 && blockElements[strings.ToLower(tag[1])] {
			prevWasBlock = true
		}

		lastPos = loc[1]
	}

	// Trailing text
	if lastPos < len(html) {
		text := html[lastPos:]
		decoded := decodeEntities(text)
		if decoded != "" {
			if prevWasBlock && b.Len() > 0 {
				b.WriteByte('\n')
			}
			b.WriteString(decoded)
		}
	}

	return b.String()
}

func decodeEntities(s string) string {
	return entityRe.ReplaceAllStringFunc(s, func(m string) string {
		sub := entityRe.FindStringSubmatch(m)
		if sub[1] != "" { // &#NNN;
			if code, err := strconv.Atoi(sub[1]); err == nil {
				return string(rune(code))
			}
		}
		if sub[2] != "" { // &#xHHH;
			if code, err := strconv.ParseInt(sub[2], 16, 32); err == nil {
				return string(rune(code))
			}
		}
		if sub[3] != "" { // &name;
			if r, ok := namedEntities[sub[3]]; ok {
				return r
			}
		}
		return m
	})
}

// FindTextPosition locates selectedText in textContent, using hintOffset for disambiguation.
func FindTextPosition(textContent, selectedText string, hintOffset int) (start, end int, ok bool) {
	if selectedText == "" {
		return 0, 0, false
	}

	var positions []int
	searchFrom := 0
	for {
		idx := strings.Index(textContent[searchFrom:], selectedText)
		if idx < 0 {
			break
		}
		positions = append(positions, searchFrom+idx)
		searchFrom += idx + 1
	}

	if len(positions) == 0 {
		return 0, 0, false
	}

	if len(positions) == 1 {
		return positions[0], positions[0] + len(selectedText), true
	}

	// Multiple matches — pick closest to hint
	best := positions[0]
	bestDist := abs(best - hintOffset)
	for _, pos := range positions[1:] {
		d := abs(pos - hintOffset)
		if d < bestDist {
			best = pos
			bestDist = d
		}
	}

	return best, best + len(selectedText), true
}
