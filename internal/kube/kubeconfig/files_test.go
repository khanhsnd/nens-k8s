package kubeconfig

import (
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

const sample = `apiVersion: v1
kind: Config
current-context: Paste Me
clusters:
  - name: demo
    cluster:
      server: https://127.0.0.1:6443
contexts:
  - name: Paste Me
    context:
      cluster: demo
      user: demo
      namespace: apps
users:
  - name: demo
    user:
      token: secret
`

type settings struct {
	dir   string
	paths []string
	names map[string]string
}

func (s *settings) Dir() (string, error)  { return s.dir, nil }
func (s *settings) Kubeconfigs() []string { return slices.Clone(s.paths) }

func (s *settings) SetKubeconfigs(paths []string) error {
	s.paths = paths
	return nil
}

func (s *settings) ClusterNames() map[string]string { return maps.Clone(s.names) }

func (s *settings) SetClusterName(id string, name string) error {
	if s.names == nil {
		s.names = make(map[string]string)
	}
	s.names[id] = name
	return nil
}

func newLoader(t *testing.T) (*Loader, *settings) {
	t.Helper()

	empty := filepath.Join(t.TempDir(), "kubeconfig")
	if err := os.WriteFile(empty, []byte("apiVersion: v1\nkind: Config\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("KUBECONFIG", empty)

	store := &settings{dir: t.TempDir()}
	return NewLoader(store), store
}

func TestImportStoresAndExposesTheContexts(t *testing.T) {
	loader, store := newLoader(t)

	file, err := loader.Import(sample)
	if err != nil {
		t.Fatal(err)
	}
	if file.Contexts != 1 || !file.Removable {
		t.Fatalf("unexpected file: %+v", file)
	}
	if base := filepath.Base(file.Path); base != "paste-me.yaml" {
		t.Errorf("file name = %q, want paste-me.yaml", base)
	}
	if !slices.Contains(store.paths, file.Path) {
		t.Error("imported file was not persisted to settings")
	}

	clusters, err := loader.Clusters()
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, cluster := range clusters {
		if cluster.ID == "Paste Me" {
			found = true
			if cluster.Namespace != "apps" || cluster.Server != "https://127.0.0.1:6443" {
				t.Errorf("unexpected cluster: %+v", cluster)
			}
		}
	}
	if !found {
		t.Fatalf("imported context missing from %+v", clusters)
	}
}

func TestImportKeepsBothFilesOnNameCollision(t *testing.T) {
	loader, _ := newLoader(t)

	first, err := loader.Import(sample)
	if err != nil {
		t.Fatal(err)
	}
	second, err := loader.Import(sample)
	if err != nil {
		t.Fatal(err)
	}

	if first.Path == second.Path {
		t.Fatalf("second import overwrote %s", first.Path)
	}
	if base := filepath.Base(second.Path); base != "paste-me-2.yaml" {
		t.Errorf("file name = %q, want paste-me-2.yaml", base)
	}
}

func TestRemoveDeletesAnImportedCopy(t *testing.T) {
	loader, store := newLoader(t)

	file, err := loader.Import(sample)
	if err != nil {
		t.Fatal(err)
	}
	if err := loader.Remove(file.Path); err != nil {
		t.Fatal(err)
	}

	if len(store.paths) != 0 {
		t.Errorf("settings still track %v", store.paths)
	}
	if _, err := os.Stat(file.Path); !os.IsNotExist(err) {
		t.Errorf("%s should have been deleted", file.Path)
	}
}

func TestRemoveLeavesReferencedFilesAlone(t *testing.T) {
	loader, _ := newLoader(t)

	path := filepath.Join(t.TempDir(), "elsewhere.yaml")
	if err := os.WriteFile(path, []byte(sample), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loader.Add(path); err != nil {
		t.Fatal(err)
	}
	if err := loader.Remove(path); err != nil {
		t.Fatal(err)
	}

	if _, err := os.Stat(path); err != nil {
		t.Errorf("a referenced file must survive removal: %v", err)
	}
}

func TestAddFolderTakesEveryKubeconfigInside(t *testing.T) {
	loader, store := newLoader(t)

	dir := t.TempDir()
	for _, name := range []string{"alpha.yaml", "beta.conf"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(sample), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("}not yaml{"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "nested"), 0o700); err != nil {
		t.Fatal(err)
	}

	files, err := loader.Add(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("expected the two kubeconfigs, got %+v", files)
	}
	if len(store.paths) != 2 {
		t.Errorf("settings track %v, want just the two kubeconfigs", store.paths)
	}
}

func TestAddFolderWithoutAKubeconfigIsRejected(t *testing.T) {
	loader, _ := newLoader(t)

	if _, err := loader.Add(t.TempDir()); err == nil {
		t.Error("an empty folder should be rejected")
	}
}

func TestRejectsInputWithoutContexts(t *testing.T) {
	loader, _ := newLoader(t)

	if _, err := loader.Import("apiVersion: v1\nkind: Config\n"); err == nil {
		t.Error("a kubeconfig with no contexts should be rejected")
	}
	if _, err := loader.Import("}not yaml{"); err == nil {
		t.Error("garbage should be rejected")
	}
	if _, err := loader.Add(filepath.Join(t.TempDir(), "missing.yaml")); err == nil {
		t.Error("a missing file should be rejected")
	}
}

func TestFilesListsDefaultAndAddedSources(t *testing.T) {
	loader, _ := newLoader(t)

	if _, err := loader.Import(sample); err != nil {
		t.Fatal(err)
	}

	files := loader.Files()
	if len(files) != 2 {
		t.Fatalf("expected the KUBECONFIG file and the import, got %+v", files)
	}
	if files[0].Removable {
		t.Error("the ambient KUBECONFIG file must not be removable")
	}
	if !strings.HasSuffix(files[1].Path, "paste-me.yaml") || !files[1].Removable {
		t.Errorf("unexpected second source: %+v", files[1])
	}
}
