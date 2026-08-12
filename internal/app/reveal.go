package app

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// reveal opens the folder holding path in the OS file manager. The Wails runtime
// has no call for it — `BrowserOpenURL` on a file opens whatever app owns the
// extension — and internal/app is the OS edge, so the exec lives here.
//
// The folder is opened rather than the file selected: `explorer /select,<path>`
// does not survive the quoting Go applies to an argument holding spaces.
func reveal(path string) error {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return err
	}

	dir := absolute
	if info, err := os.Stat(absolute); err != nil || !info.IsDir() {
		dir = filepath.Dir(absolute)
	}

	switch runtime.GOOS {
	case "windows":
		// explorer reports exit status 1 even when it opened the window.
		_ = exec.Command("explorer", dir).Run()
		return nil
	case "darwin":
		return exec.Command("open", dir).Run()
	default:
		return exec.Command("xdg-open", dir).Run()
	}
}
