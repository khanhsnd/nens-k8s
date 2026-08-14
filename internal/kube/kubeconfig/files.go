package kubeconfig

import (
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"nens-k8s/internal/domain"

	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/clientcmd/api"
)

const importedDir = "kubeconfigs"

func (l *Loader) Files() []domain.KubeconfigFile {
	files := make([]domain.KubeconfigFile, 0)

	for _, path := range clientcmd.NewDefaultClientConfigLoadingRules().Precedence {
		if _, err := os.Stat(path); err != nil {
			continue
		}
		files = append(files, l.describe(path, false))
	}
	for _, path := range l.settings.Kubeconfigs() {
		files = append(files, l.describe(path, true))
	}
	return files
}

// Add references a kubeconfig where it lives. A folder adds every file directly
// inside it that parses as a kubeconfig, so a directory of per-cluster files is
// one action instead of one per file.
func (l *Loader) Add(path string) ([]domain.KubeconfigFile, error) {
	absolute, err := expand(path)
	if err != nil {
		return nil, err
	}

	info, err := os.Stat(absolute)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		paths, err := kubeconfigsIn(absolute)
		if err != nil {
			return nil, err
		}
		return l.trackAll(paths)
	}

	if _, err := load(clientcmd.LoadFromFile(absolute)); err != nil {
		return nil, err
	}
	return l.trackAll([]string{absolute})
}

// kubeconfigsIn keeps only what parses — a folder holds notes, certificates and
// caches next to the configs, and refusing the whole folder over one of them
// would make the feature useless.
func kubeconfigsIn(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		if _, err := load(clientcmd.LoadFromFile(path)); err == nil {
			paths = append(paths, path)
		}
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("no kubeconfig in %s", dir)
	}
	return paths, nil
}

func (l *Loader) Import(content string) (domain.KubeconfigFile, error) {
	config, err := load(clientcmd.Load([]byte(content)))
	if err != nil {
		return domain.KubeconfigFile{}, err
	}

	dir, err := l.importDir()
	if err != nil {
		return domain.KubeconfigFile{}, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return domain.KubeconfigFile{}, err
	}

	path := freePath(dir, slug(preferredName(config)))
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return domain.KubeconfigFile{}, err
	}
	return l.track(path)
}

func (l *Loader) Remove(path string) error {
	paths := l.settings.Kubeconfigs()
	kept := slices.DeleteFunc(paths, func(item string) bool { return item == path })
	if len(kept) == len(paths) {
		return fmt.Errorf("%s was not added through Nens", path)
	}

	if err := l.settings.SetKubeconfigs(kept); err != nil {
		return err
	}
	if l.imported(path) {
		return os.Remove(path)
	}
	return nil
}

func (l *Loader) track(path string) (domain.KubeconfigFile, error) {
	files, err := l.trackAll([]string{path})
	if err != nil {
		return domain.KubeconfigFile{}, err
	}
	return files[0], nil
}

// trackAll saves the whole batch in one settings write — a folder of twenty
// files should not rewrite settings.json twenty times.
func (l *Loader) trackAll(paths []string) ([]domain.KubeconfigFile, error) {
	tracked := l.settings.Kubeconfigs()
	for _, path := range paths {
		if !slices.Contains(tracked, path) {
			tracked = append(tracked, path)
		}
	}
	if err := l.settings.SetKubeconfigs(tracked); err != nil {
		return nil, err
	}

	files := make([]domain.KubeconfigFile, 0, len(paths))
	for _, path := range paths {
		files = append(files, l.describe(path, true))
	}
	return files, nil
}

func (l *Loader) describe(path string, removable bool) domain.KubeconfigFile {
	file := domain.KubeconfigFile{Path: path, Removable: removable}

	config, err := clientcmd.LoadFromFile(path)
	if err != nil {
		file.Error = err.Error()
		return file
	}
	file.Contexts = len(config.Contexts)
	return file
}

func (l *Loader) importDir() (string, error) {
	dir, err := l.settings.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, importedDir), nil
}

func (l *Loader) imported(path string) bool {
	dir, err := l.importDir()
	if err != nil {
		return false
	}
	relative, err := filepath.Rel(dir, path)
	return err == nil && !strings.HasPrefix(relative, "..")
}

func load(config *api.Config, err error) (*api.Config, error) {
	if err != nil {
		return nil, err
	}
	if len(config.Contexts) == 0 {
		return nil, errors.New("this kubeconfig has no contexts")
	}
	return config, nil
}

func expand(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("no path given")
	}

	if after, found := strings.CutPrefix(path, "~"); found {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		path = filepath.Join(home, after)
	}
	return filepath.Abs(path)
}

func preferredName(config *api.Config) string {
	if config.CurrentContext != "" {
		return config.CurrentContext
	}
	return slices.Sorted(maps.Keys(config.Contexts))[0]
}

func slug(name string) string {
	cleaned := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		case r >= 'A' && r <= 'Z':
			return r + ('a' - 'A')
		default:
			return '-'
		}
	}, name)

	if cleaned = strings.Trim(cleaned, "-"); cleaned == "" {
		return "kubeconfig"
	}
	return cleaned
}

func freePath(dir, name string) string {
	path := filepath.Join(dir, name+".yaml")
	for index := 2; ; index++ {
		if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
			return path
		}
		path = filepath.Join(dir, fmt.Sprintf("%s-%d.yaml", name, index))
	}
}
