package server

import "sync"

// Comment represents a review comment anchored to a text selection.
type Comment struct {
	ID               string `json:"id"`
	SelectedText     string `json:"selectedText"`
	Comment          string `json:"comment"`
	CreatedAt        string `json:"createdAt"`
	StartOffset      int    `json:"startOffset"`
	EndOffset        int    `json:"endOffset"`
	LineHint         string `json:"lineHint,omitempty"`
	AnchorConfidence string `json:"anchorConfidence,omitempty"`
	AnchorPrefix     string `json:"anchorPrefix,omitempty"`
}

// Heading represents a document heading extracted from markdown.
type Heading struct {
	ID    string `json:"id"`
	Text  string `json:"text"`
	Level int    `json:"level"`
}

// FileState holds the in-memory state for a loaded document.
type FileState struct {
	FilePath     string
	FileName     string
	Content      []byte
	RenderedHTML string
	Headings     []Heading
	IsLoaded     bool
	mu           sync.Mutex
}

// Settings holds user preferences persisted to ~/.readit/settings.json.
type Settings struct {
	Version    int    `json:"version"`
	FontFamily string `json:"fontFamily"`
}

// CommentFile represents the parsed contents of a .comments.md file.
type CommentFile struct {
	Source   string
	Hash    string
	Version int
	Comments []Comment
}

// InlineData is the JSON payload embedded in the initial HTML page.
type InlineData struct {
	Files          []FileRef                  `json:"files"`
	ActiveFile     string                     `json:"activeFile"`
	Clean          bool                       `json:"clean"`
	WorkingDir     string                     `json:"workingDirectory"`
	Documents      map[string]InlineDocData   `json:"documents"`
	Settings       Settings                   `json:"settings"`
}

// FileRef is a file entry in the documents list.
type FileRef struct {
	Path     string `json:"path"`
	FileName string `json:"fileName"`
}

// InlineDocData holds per-document data embedded in the initial page.
type InlineDocData struct {
	Headings []Heading  `json:"headings"`
	Comments []Comment  `json:"comments"`
}

// Anchor confidence levels.
const (
	AnchorExact      = "exact"
	AnchorNormalized = "normalized"
	AnchorFuzzy      = "fuzzy"
	AnchorUnresolved = "unresolved"
)

// Font family options.
const (
	FontSerif     = "serif"
	FontSansSerif = "sans-serif"
)

// Storage constants.
const (
	FormatVersion      = 1
	HashLength         = 16
	MaxSelectionLength = 1000
	TruncationMarker   = "\n...\n"
	AnchorPrefixLength = 200
)

// Anchor resolution constants.
const (
	DefaultSearchWindow  = 500
	DefaultFuzzyThreshold = 5
	MaxFuzzyTextLength   = 200
	FuzzySearchWindow    = 2000
)
