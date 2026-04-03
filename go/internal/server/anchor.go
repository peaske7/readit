package server

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

var lineHintRe = regexp.MustCompile(`^L(\d+)(?:-L?(\d+))?$`)

type AnchorResult struct {
	StartOffset int
	EndOffset   int
	Confidence  string
}

func ParseLineHint(hint string) (start, end int) {
	m := lineHintRe.FindStringSubmatch(hint)
	if m == nil {
		return 1, 1
	}
	_, _ = fmt.Sscanf(m[1], "%d", &start)
	if m[2] != "" {
		_, _ = fmt.Sscanf(m[2], "%d", &end)
	} else {
		end = start
	}
	return
}

// lineOffset returns the byte offset of the start of the given 1-indexed line.
func lineOffset(content string, line int) int {
	if line <= 1 {
		return 0
	}
	n := 0
	for i, c := range content {
		if c == '\n' {
			n++
			if n == line-1 {
				return i + 1
			}
		}
	}
	return len(content)
}

func FindAnchor(source, selectedText, lineHint string) *AnchorResult {
	if selectedText == "" {
		return nil
	}

	// Try exact match near hint first
	hintLine, _ := ParseLineHint(lineHint)
	offset := lineOffset(source, hintLine)

	windowStart := max(0, offset-DefaultSearchWindow)
	windowEnd := min(len(source), offset+DefaultSearchWindow)
	window := source[windowStart:windowEnd]

	if idx := strings.Index(window, selectedText); idx >= 0 {
		start := windowStart + idx
		return &AnchorResult{
			StartOffset: start,
			EndOffset:   start + len(selectedText),
			Confidence:  AnchorExact,
		}
	}

	// Fall back to full source
	if idx := strings.Index(source, selectedText); idx >= 0 {
		return &AnchorResult{
			StartOffset: idx,
			EndOffset:   idx + len(selectedText),
			Confidence:  AnchorExact,
		}
	}

	return nil
}

func normalizeWhitespace(s string) string {
	var b strings.Builder
	inSpace := false
	for _, r := range s {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if !inSpace {
				b.WriteByte(' ')
				inSpace = true
			}
		} else {
			b.WriteRune(r)
			inSpace = false
		}
	}
	return strings.TrimSpace(b.String())
}

func FindAnchorNormalized(source, selectedText, lineHint string) *AnchorResult {
	normText := normalizeWhitespace(selectedText)
	normSource := normalizeWhitespace(source)
	if normText == selectedText && normSource == source {
		return nil // no normalization needed
	}

	// Try windowed search near the hint first
	hintLine, _ := ParseLineHint(lineHint)
	offset := lineOffset(source, hintLine)
	normCharOffset := mapSourceToNormCharOffset(source, offset)

	normRunes := []rune(normSource)
	normTextRunes := []rune(normText)
	normTextRuneLen := len(normTextRunes)

	windowStart := max(0, normCharOffset-DefaultSearchWindow)
	windowEnd := min(len(normRunes), normCharOffset+DefaultSearchWindow)
	window := string(normRunes[windowStart:windowEnd])

	if byteIdx := strings.Index(window, normText); byteIdx >= 0 {
		charIdx := utf8.RuneCountInString(window[:byteIdx])
		return resolveNormalizedMatch(source, windowStart+charIdx, normTextRuneLen)
	}

	// Fall back to full source
	if byteIdx := strings.Index(normSource, normText); byteIdx >= 0 {
		charIdx := utf8.RuneCountInString(normSource[:byteIdx])
		return resolveNormalizedMatch(source, charIdx, normTextRuneLen)
	}

	return nil
}

func resolveNormalizedMatch(source string, normCharIdx int, normTextRuneLen int) *AnchorResult {
	origStart := mapNormalizedCharOffset(source, normCharIdx)
	origEnd := mapNormalizedCharOffset(source, normCharIdx+normTextRuneLen)

	// Trim trailing whitespace at end position
	for origEnd > origStart && origEnd < len(source) {
		if c := source[origEnd-1]; c == ' ' || c == '\t' || c == '\n' || c == '\r' {
			origEnd--
		} else {
			break
		}
	}

	return &AnchorResult{
		StartOffset: origStart,
		EndOffset:   origEnd,
		Confidence:  AnchorNormalized,
	}
}

func mapSourceToNormCharOffset(original string, sourceOffset int) int {
	normPos := 0
	inSpace := false
	for i, r := range original {
		if i >= sourceOffset {
			return normPos
		}
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if !inSpace {
				normPos++
				inSpace = true
			}
		} else {
			normPos++
			inSpace = false
		}
	}
	return normPos
}

func mapNormalizedCharOffset(original string, normCharOffset int) int {
	normPos := 0
	inSpace := false
	for i, r := range original {
		if normPos >= normCharOffset {
			return i
		}
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			if !inSpace {
				normPos++
				inSpace = true
			}
		} else {
			normPos++
			inSpace = false
		}
	}
	return len(original)
}

func FindAnchorFuzzy(source, selectedText, lineHint string) *AnchorResult {
	selectedRunes := []rune(selectedText)
	if len(selectedRunes) > MaxFuzzyTextLength {
		return nil
	}

	hintLine, _ := ParseLineHint(lineHint)
	offset := lineOffset(source, hintLine)

	windowStart := max(0, offset-FuzzySearchWindow)
	windowEnd := min(len(source), offset+FuzzySearchWindow)
	window := source[windowStart:windowEnd]

	windowRunes := []rune(window)
	textRuneLen := len(selectedRunes)
	threshold := DefaultFuzzyThreshold

	bestDist := threshold + 1
	bestStart := -1
	bestEnd := -1

	for i := 0; i <= len(windowRunes)-textRuneLen+threshold; i++ {
		for candLen := max(1, textRuneLen-threshold); candLen <= min(len(windowRunes)-i, textRuneLen+threshold); candLen++ {
			candidate := windowRunes[i : i+candLen]
			dist := levenshteinRunes(selectedRunes, candidate, threshold)
			if dist <= threshold && dist < bestDist {
				bestDist = dist
				// Convert rune indices back to byte offsets
				byteStart := len(string(windowRunes[:i]))
				byteEnd := len(string(windowRunes[:i+candLen]))
				bestStart = windowStart + byteStart
				bestEnd = windowStart + byteEnd
			}
		}
	}

	if bestStart < 0 {
		return nil
	}

	return &AnchorResult{
		StartOffset: bestStart,
		EndOffset:   bestEnd,
		Confidence:  AnchorFuzzy,
	}
}

func levenshteinRunes(a, b []rune, maxDist int) int {
	la, lb := len(a), len(b)
	if abs(la-lb) > maxDist {
		return maxDist + 1
	}

	if la > lb {
		a, b = b, a
		la, lb = lb, la
	}

	prev := make([]int, la+1)
	curr := make([]int, la+1)

	for i := range prev {
		prev[i] = i
	}

	for j := 1; j <= lb; j++ {
		curr[0] = j
		minVal := curr[0]
		for i := 1; i <= la; i++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			curr[i] = min(
				prev[i]+1,
				min(curr[i-1]+1, prev[i-1]+cost),
			)
			if curr[i] < minVal {
				minVal = curr[i]
			}
		}
		if minVal > maxDist {
			return maxDist + 1
		}
		prev, curr = curr, prev
	}

	return prev[la]
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func FindAnchorWithFallback(source, selectedText, lineHint string) *AnchorResult {
	if r := FindAnchor(source, selectedText, lineHint); r != nil {
		return r
	}
	if r := FindAnchorNormalized(source, selectedText, lineHint); r != nil {
		return r
	}
	if r := FindAnchorFuzzy(source, selectedText, lineHint); r != nil {
		return r
	}
	return nil
}
