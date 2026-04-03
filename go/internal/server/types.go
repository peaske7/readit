package server

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

type Heading struct {
	ID    string `json:"id"`
	Text  string `json:"text"`
	Level int    `json:"level"`
}

type FileState struct {
	FilePath     string
	FileName     string
	Content      []byte
	RenderedHTML string
	Headings     []Heading
	IsLoaded     bool
}

type ShortcutBinding struct {
	Key   string `json:"key"`
	Alt   bool   `json:"alt,omitempty"`
	Ctrl  bool   `json:"ctrl,omitempty"`
	Meta  bool   `json:"meta,omitempty"`
	Shift bool   `json:"shift,omitempty"`
}

type Keybinding struct {
	ID      string           `json:"id"`
	Binding *ShortcutBinding `json:"binding,omitempty"`
	Enabled bool             `json:"enabled"`
}

type Settings struct {
	Version     int          `json:"version"`
	FontFamily  string       `json:"fontFamily"`
	Keybindings []Keybinding `json:"keybindings,omitempty"`
}

type CommentFile struct {
	Source   string
	Hash     string
	Version  int
	Comments []Comment
}

type InlineData struct {
	Files      []FileRef                `json:"files"`
	ActiveFile string                   `json:"activeFile"`
	Clean      bool                     `json:"clean"`
	WorkingDir string                   `json:"workingDirectory"`
	Documents  map[string]InlineDocData `json:"documents"`
	Settings   Settings                 `json:"settings"`
}

type FileRef struct {
	Path     string `json:"path"`
	FileName string `json:"fileName"`
}

type InlineDocData struct {
	Headings []Heading `json:"headings"`
	Comments []Comment `json:"comments"`
}

const (
	AnchorExact      = "exact"
	AnchorNormalized = "normalized"
	AnchorFuzzy      = "fuzzy"
	AnchorUnresolved = "unresolved"
)

const (
	FontSerif     = "serif"
	FontSansSerif = "sans-serif"
)

const (
	FormatVersion      = 1
	HashLength         = 16
	MaxSelectionLength = 1000
	TruncationMarker   = "\n...\n"
	AnchorPrefixLength = 200
)

const (
	DefaultSearchWindow   = 500
	DefaultFuzzyThreshold = 5
	MaxFuzzyTextLength    = 200
	FuzzySearchWindow     = 2000
)
