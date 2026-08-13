package config

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"sync"

	"nens-k8s/internal/domain"
)

const (
	appDir   = "Nens"
	fileName = "settings.json"
)

type data struct {
	Kubeconfigs  []string             `json:"kubeconfigs"`
	ClusterNames map[string]string    `json:"clusterNames"`
	Forwards     []domain.ForwardSpec `json:"forwards"`
}

type Store struct {
	mu   sync.RWMutex
	dir  string
	err  error
	data data
}

func Dir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("no writable config directory: %w", err)
	}
	return filepath.Join(base, appDir), nil
}

func NewStore() *Store {
	dir, err := Dir()
	if err != nil {
		return &Store{err: err}
	}

	store := &Store{dir: dir}
	store.read()
	return store
}

func (s *Store) Dir() (string, error) {
	if s.dir == "" {
		return "", s.err
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

func (s *Store) ClusterNames() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return maps.Clone(s.data.ClusterNames)
}

func (s *Store) SetClusterName(id string, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	previous := maps.Clone(s.data.ClusterNames)
	if name == "" {
		delete(s.data.ClusterNames, id)
	} else {
		if s.data.ClusterNames == nil {
			s.data.ClusterNames = make(map[string]string)
		}
		s.data.ClusterNames[id] = name
	}

	if err := s.write(); err != nil {
		s.data.ClusterNames = previous
		return err
	}
	return nil
}

func (s *Store) Forwards() []domain.ForwardSpec {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return slices.Clone(s.data.Forwards)
}

func (s *Store) SetForwards(specs []domain.ForwardSpec) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	previous := s.data.Forwards
	s.data.Forwards = specs
	if err := s.write(); err != nil {
		s.data.Forwards = previous
		return err
	}
	return nil
}

func (s *Store) read() {
	path := filepath.Join(s.dir, fileName)

	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	if err := json.Unmarshal(raw, &s.data); err != nil {
		slog.Warn("settings file ignored", "path", path, "error", err)
	}
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
