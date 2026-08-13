package main

import (
	"embed"
	"encoding/json"
	"log/slog"
	"os"

	"nens-k8s/internal/app"
	"nens-k8s/internal/config"
	"nens-k8s/internal/logging"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed wails.json
var project []byte

func version() string {
	var info struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(project, &info); err != nil || info.Info.ProductVersion == "" {
		return "dev"
	}
	return info.Info.ProductVersion
}

func main() {
	dir, _ := config.Dir()
	stop := logging.Setup(dir)

	current := version()
	slog.Info("nens starting", "version", current, "config", dir)

	logger, level := logging.Wails()
	application := app.New(current)

	err := wails.Run(&options.App{
		Title:            "Nens",
		Width:            1440,
		Height:           900,
		MinWidth:         1100,
		MinHeight:        680,
		AssetServer:      &assetserver.Options{Assets: assets},
		BackgroundColour: &options.RGBA{R: 10, G: 12, B: 16, A: 1},
		Logger:           logger,
		LogLevel:         level,
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		OnStartup:  application.Startup,
		OnShutdown: application.Shutdown,
		Bind:       application.Bindings(),
	})
	if err != nil {
		slog.Error("nens stopped", "error", err)
		stop()
		os.Exit(1)
	}

	slog.Info("nens stopped")
	stop()
}
