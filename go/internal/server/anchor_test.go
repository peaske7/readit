package server

import "testing"

func TestParseLineHint(t *testing.T) {
	tests := []struct {
		input       string
		wantStart   int
		wantEnd     int
	}{
		{"L42", 42, 42},
		{"L42-L55", 42, 55},
		{"L42-55", 42, 55},    // legacy format
		{"invalid", 1, 1},
	}

	for _, tt := range tests {
		s, e := ParseLineHint(tt.input)
		if s != tt.wantStart || e != tt.wantEnd {
			t.Errorf("ParseLineHint(%q) = (%d, %d), want (%d, %d)", tt.input, s, e, tt.wantStart, tt.wantEnd)
		}
	}
}

func TestFindAnchorExact(t *testing.T) {
	source := "line1\nline2\nthe target text\nline4"
	result := FindAnchor(source, "the target text", "L3")
	if result == nil {
		t.Fatal("expected match")
	}
	if result.Confidence != AnchorExact {
		t.Errorf("confidence = %q, want exact", result.Confidence)
	}
	if source[result.StartOffset:result.EndOffset] != "the target text" {
		t.Errorf("matched text = %q", source[result.StartOffset:result.EndOffset])
	}
}

func TestFindAnchorExactFullScan(t *testing.T) {
	source := "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nfar away target"
	result := FindAnchor(source, "far away target", "L1")
	if result == nil {
		t.Fatal("expected match via full scan")
	}
	if result.Confidence != AnchorExact {
		t.Errorf("confidence = %q, want exact", result.Confidence)
	}
}

func TestFindAnchorNormalized(t *testing.T) {
	source := "hello   world\nfoo"
	result := FindAnchorNormalized(source, "hello world", "L1")
	if result == nil {
		t.Fatal("expected normalized match")
	}
	if result.Confidence != AnchorNormalized {
		t.Errorf("confidence = %q, want normalized", result.Confidence)
	}
}

func TestFindAnchorNormalizedSkipsSame(t *testing.T) {
	source := "hello world"
	result := FindAnchorNormalized(source, "hello world", "L1")
	if result != nil {
		t.Error("should return nil when both source and text already normalized")
	}
}

func TestFindAnchorFuzzy(t *testing.T) {
	source := "the quick brwon fox jumps"
	result := FindAnchorFuzzy(source, "the quick brown fox jumps", "L1")
	if result == nil {
		t.Fatal("expected fuzzy match")
	}
	if result.Confidence != AnchorFuzzy {
		t.Errorf("confidence = %q, want fuzzy", result.Confidence)
	}
}

func TestFindAnchorFuzzyTooLong(t *testing.T) {
	long := make([]byte, MaxFuzzyTextLength+1)
	for i := range long {
		long[i] = 'a'
	}
	result := FindAnchorFuzzy("aaaa", string(long), "L1")
	if result != nil {
		t.Error("should return nil for text exceeding MaxFuzzyTextLength")
	}
}

func TestFindAnchorWithFallback(t *testing.T) {
	source := "line1\nhello   world\nline3"

	// Exact match
	r := FindAnchorWithFallback(source, "hello   world", "L2")
	if r == nil || r.Confidence != AnchorExact {
		t.Error("expected exact match")
	}

	// Normalized fallback
	r = FindAnchorWithFallback(source, "hello world", "L2")
	if r == nil || r.Confidence != AnchorNormalized {
		t.Errorf("expected normalized match, got %v", r)
	}

	// No match
	r = FindAnchorWithFallback(source, "nonexistent text that does not appear anywhere at all", "L1")
	if r != nil {
		t.Error("expected nil for non-matching text")
	}
}
