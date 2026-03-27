package server

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var embeddedAssets embed.FS

// EmbeddedAssetsFS returns the embedded dist/ filesystem.
// Returns nil if the dist/ directory doesn't exist (dev mode without a build).
func EmbeddedAssetsFS() fs.FS {
	sub, err := fs.Sub(embeddedAssets, "dist")
	if err != nil {
		return nil
	}
	return sub
}
