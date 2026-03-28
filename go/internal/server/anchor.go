package server

import (
	"fmt"
	"regexp"
	"strings"
)

var lineHintRe = regexp.MustCompile(`^L(\d+)(?:-L?(\d+))?$`)

// AnchorResult holds the result of an anchor resolution attempt.
type AnchorResult struct {
	StartOffset int
	EndOffset   int
	Confidence  string
}

// ParseLineHint extracts start and end line numbers from a hint like "L42" or "L42-L55".
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

// FindAnchor tries to locate selectedText in source content using lineHint.
// Returns nil if no match found.
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

	// Try exact match in full source
	if idx := strings.Index(source, selectedText); idx >= 0 {
		return &AnchorResult{
			StartOffset: idx,
			EndOffset:   idx + len(selectedText),
			Confidence:  AnchorExact,
		}
	}

	return nil
}

// normalizeWhitespace collapses all whitespace runs to a single space.
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

// FindAnchorNormalized tries a whitespace-normalized match.
// It searches near the lineHint first, then falls back to the full source.
func FindAnchorNormalized(source, selectedText, lineHint string) *AnchorResult {
	normText := normalizeWhitespace(selectedText)
	normSource := normalizeWhitespace(source)
	if normText == selectedText && normSource == source {
		return nil // no normalization needed
	}

	// Try windowed search near the hint first
	hintLine, _ := ParseLineHint(lineHint)
	offset := lineOffset(source, hintLine)
	normOffset := mapSourceToNormOffset(source, offset)

	windowStart := max(0, normOffset-DefaultSearchWindow)
	windowEnd := min(len(normSource), normOffset+DefaultSearchWindow)
	window := normSource[windowStart:windowEnd]

	if idx := strings.Index(window, normText); idx >= 0 {
		return resolveNormalizedMatch(source, windowStart+idx, normText)
	}

	// Fall back to full source
	if idx := strings.Index(normSource, normText); idx >= 0 {
		return resolveNormalizedMatch(source, idx, normText)
	}

	return nil
}

// resolveNormalizedMatch maps a match in normalized text back to the original source.
func resolveNormalizedMatch(source string, normIdx int, normText string) *AnchorResult {
	origStart := mapNormalizedOffset(source, normIdx)
	origEnd := mapNormalizedOffset(source, normIdx+len(normText))

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

// mapSourceToNormOffset converts a byte offset in the original text to the
// corresponding offset in the normalized text.
func mapSourceToNormOffset(original string, sourceOffset int) int {
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

// mapNormalizedOffset converts an offset in normalized text back to the original text.
func mapNormalizedOffset(original string, normOffset int) int {
	normPos := 0
	inSpace := false
	for i, r := range original {
		if normPos >= normOffset {
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

// FindAnchorFuzzy uses Levenshtein distance for approximate matching.
func FindAnchorFuzzy(source, selectedText, lineHint string) *AnchorResult {
	if len(selectedText) > MaxFuzzyTextLength {
		return nil
	}

	hintLine, _ := ParseLineHint(lineHint)
	offset := lineOffset(source, hintLine)

	windowStart := max(0, offset-FuzzySearchWindow)
	windowEnd := min(len(source), offset+FuzzySearchWindow)
	window := source[windowStart:windowEnd]

	textLen := len(selectedText)
	threshold := DefaultFuzzyThreshold

	bestDist := threshold + 1
	bestStart := -1
	bestEnd := -1

	for i := 0; i <= len(window)-textLen+threshold; i++ {
		for candLen := max(1, textLen-threshold); candLen <= min(len(window)-i, textLen+threshold); candLen++ {
			candidate := window[i : i+candLen]
			dist := levenshtein(selectedText, candidate, threshold)
			if dist <= threshold && dist < bestDist {
				bestDist = dist
				bestStart = windowStart + i
				bestEnd = windowStart + i + candLen
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

// levenshtein computes edit distance with early exit at maxDist.
func levenshtein(a, b string, maxDist int) int {
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

// FindAnchorWithFallback tries exact → normalized → fuzzy matching in order.
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
