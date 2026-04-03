package server

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var embeddedAssets embed.FS

func EmbeddedAssetsFS() fs.FS {
	sub, err := fs.Sub(embeddedAssets, "dist")
	if err != nil {
		return nil
	}
	return sub
}
