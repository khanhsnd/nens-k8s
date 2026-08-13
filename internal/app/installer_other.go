//go:build !windows

package app

import "errors"

func startInstaller(string) error {
	return errors.New("Nens installs its own updates on Windows only")
}
