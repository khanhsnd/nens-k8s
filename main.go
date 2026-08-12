package main

import (
	"embed"

	"nens-k8s/internal/app"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	application := app.New()

	err := wails.Run(&options.App{
		Title:            "Nens",
		Width:            1440,
		Height:           900,
		MinWidth:         1100,
		MinHeight:        680,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: &options.RGBA{R: 10, G: 12, B: 16, A: 1},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		OnStartup:  application.Startup,
		OnShutdown: application.Shutdown,
		Bind:       application.Bindings(),
	})
	if err != nil {
		panic(err)
	}
}
