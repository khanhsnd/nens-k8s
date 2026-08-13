package logging

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v2/pkg/logger"
)

func start(t *testing.T) (string, func()) {
	t.Helper()

	original := slog.Default()
	t.Cleanup(func() { slog.SetDefault(original) })

	dir := t.TempDir()
	return dir, Setup(dir)
}

func written(t *testing.T, dir string) string {
	t.Helper()

	raw, err := os.ReadFile(filepath.Join(dir, fileName))
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func TestTheLogLandsInTheConfigDir(t *testing.T) {
	dir, stop := start(t)

	slog.Info("cluster connected", "cluster", "prod", "version", "v1.31.4")
	stop()

	line := written(t, dir)
	if !strings.Contains(line, "cluster connected") || !strings.Contains(line, "cluster=prod") {
		t.Errorf("log = %q, want the message and its attributes", line)
	}
}

func TestAnUnwritableDirLeavesStderr(t *testing.T) {
	original := slog.Default()
	t.Cleanup(func() { slog.SetDefault(original) })

	stop := Setup("")
	defer stop()

	slog.Info("still logging")
}

func TestTheLogRollsOverAtItsSizeLimit(t *testing.T) {
	dir := t.TempDir()

	file, err := openLog(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	chunk := []byte(strings.Repeat("x", 64<<10) + "\n")
	for written := 0; written <= maxSize; written += len(chunk) {
		if _, err := file.Write(chunk); err != nil {
			t.Fatal(err)
		}
	}

	current, err := os.Stat(filepath.Join(dir, fileName))
	if err != nil {
		t.Fatal(err)
	}
	if current.Size() >= maxSize {
		t.Errorf("current log = %d bytes, want it rolled under %d", current.Size(), maxSize)
	}

	rolled, err := os.Stat(filepath.Join(dir, previous))
	if err != nil {
		t.Fatalf("the previous log should be kept beside it: %v", err)
	}
	if rolled.Size() == 0 {
		t.Error("the previous log is empty")
	}
}

func TestTheLevelComesFromTheEnvironment(t *testing.T) {
	tests := map[string]slog.Level{
		"":         slog.LevelInfo,
		"debug":    slog.LevelDebug,
		"warn":     slog.LevelWarn,
		"nonsense": slog.LevelInfo,
	}

	for value, want := range tests {
		t.Run(value, func(t *testing.T) {
			t.Setenv(levelEnv, value)

			if level := Level(); level != want {
				t.Errorf("Level() = %v, want %v", level, want)
			}
		})
	}
}

func TestTheWebviewLogsIntoTheSameFile(t *testing.T) {
	dir, stop := start(t)

	bridge, level := Wails()
	if level != logger.INFO {
		t.Errorf("wails level = %v, want INFO until NENS_LOG_LEVEL says otherwise", level)
	}

	bridge.Warning("something the webview said")
	stop()

	line := written(t, dir)
	if !strings.Contains(line, "level=WARN") || !strings.Contains(line, "source=webview") {
		t.Errorf("log = %q, want a warning labelled as the webview's", line)
	}
}

func TestDebugRaisesWailsToo(t *testing.T) {
	t.Setenv(levelEnv, "debug")

	if _, level := Wails(); level != logger.DEBUG {
		t.Errorf("wails level = %v, want DEBUG so slog is the only filter", level)
	}
}
