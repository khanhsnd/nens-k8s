package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"sync"
)

const (
	appDir   = "Nens"
	fileName = "settings.json"
)

type data struct {
	Kubeconfigs []string `json:"kubeconfigs"`
}

type Store struct {
	mu   sync.RWMutex
	dir  string
	err  error
	data data
}

func NewStore() *Store {
	base, err := os.UserConfigDir()
	if err != nil {
		return &Store{err: err}
	}

	store := &Store{dir: filepath.Join(base, appDir)}
	store.read()
	return store
}

func (s *Store) Dir() (string, error) {
	if s.dir == "" {
		return "", fmt.Errorf("no writable config directory: %w", s.err)
	}
	return s.dir, nil
}

func (s *Store) Kubeconfigs() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return slices.Clone(s.data.Kubeconfigs)
}

func (s *Store) SetKubeconfigs(paths []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	previous := s.data.Kubeconfigs
	s.data.Kubeconfigs = paths
	if err := s.write(); err != nil {
		s.data.Kubeconfigs = previous
		return err
	}
	return nil
}

func (s *Store) read() {
	raw, err := os.ReadFile(filepath.Join(s.dir, fileName))
	if err != nil {
		return
	}
	_ = json.Unmarshal(raw, &s.data)
}

func (s *Store) write() error {
	dir, err := s.Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}

	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, fileName), raw, 0o600)
}
