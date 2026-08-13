package logging

import (
	"io"
	"log/slog"
	"os"

	"github.com/wailsapp/wails/v2/pkg/logger"
)

const levelEnv = "NENS_LOG_LEVEL"

func Setup(dir string) func() {
	file, err := openLog(dir)

	sink := io.Writer(os.Stderr)
	if err == nil {
		sink = io.MultiWriter(os.Stderr, file)
	}

	slog.SetDefault(slog.New(slog.NewTextHandler(sink, &slog.HandlerOptions{Level: Level()})))
	if err != nil {
		slog.Warn("logging to stderr only", "dir", dir, "error", err)
		return func() {}
	}
	return func() { _ = file.Close() }
}

func Level() slog.Level {
	var level slog.Level
	if err := level.UnmarshalText([]byte(os.Getenv(levelEnv))); err != nil {
		return slog.LevelInfo
	}
	return level
}

func Wails() (logger.Logger, logger.LogLevel) {
	level := logger.INFO
	if Level() <= slog.LevelDebug {
		level = logger.DEBUG
	}
	return bridge{log: slog.Default().With("source", "webview")}, level
}

type bridge struct{ log *slog.Logger }

func (b bridge) Print(message string)   { b.log.Info(message) }
func (b bridge) Trace(message string)   { b.log.Debug(message) }
func (b bridge) Debug(message string)   { b.log.Debug(message) }
func (b bridge) Info(message string)    { b.log.Info(message) }
func (b bridge) Warning(message string) { b.log.Warn(message) }
func (b bridge) Error(message string)   { b.log.Error(message) }
func (b bridge) Fatal(message string)   { b.log.Error(message) }
