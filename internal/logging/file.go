package logging

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
)

const (
	fileName = "nens.log"
	previous = "nens.log.1"
	maxSize  = 4 << 20
)

type logFile struct {
	mu   sync.Mutex
	dir  string
	file *os.File
	size int64
}

func openLog(dir string) (*logFile, error) {
	if dir == "" {
		return nil, errors.New("no writable config directory")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}

	file := &logFile{dir: dir}
	if err := file.open(); err != nil {
		return nil, err
	}
	return file, nil
}

func (f *logFile) Write(p []byte) (int, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.file == nil {
		return 0, os.ErrClosed
	}
	if f.size+int64(len(p)) > maxSize {
		if err := f.roll(); err != nil {
			return 0, err
		}
	}

	n, err := f.file.Write(p)
	f.size += int64(n)
	return n, err
}

func (f *logFile) Close() error {
	f.mu.Lock()
	defer f.mu.Unlock()

	file := f.file
	f.file = nil
	if file == nil {
		return nil
	}
	return file.Close()
}

func (f *logFile) open() error {
	file, err := os.OpenFile(filepath.Join(f.dir, fileName), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}

	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return err
	}

	f.file, f.size = file, info.Size()
	return nil
}

func (f *logFile) roll() error {
	_ = f.file.Close()
	f.file, f.size = nil, 0

	_ = os.Rename(filepath.Join(f.dir, fileName), filepath.Join(f.dir, previous))
	return f.open()
}
