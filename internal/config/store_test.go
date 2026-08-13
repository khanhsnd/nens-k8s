package config

import (
	"os"
	"path/filepath"
	"testing"

	"nens-k8s/internal/domain"
)

// os.UserConfigDir reads a different variable on every platform, so all three
// point at the same temporary directory.
func isolate(t *testing.T) string {
	t.Helper()

	dir := t.TempDir()
	t.Setenv("AppData", dir)
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)

	return dir
}

func TestDirIsTheAppFolderUnderTheUsersConfigDir(t *testing.T) {
	isolate(t)

	dir, err := Dir()
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(dir) != appDir {
		t.Errorf("Dir() = %q, want it to end in %q", dir, appDir)
	}
}

func TestSettingsSurviveARestart(t *testing.T) {
	isolate(t)
	store := NewStore()

	forward := domain.ForwardSpec{
		Ref:        domain.ResourceRef{ClusterID: "prod", Namespace: "default", Name: "api"},
		LocalPort:  34567,
		RemotePort: 8080,
	}

	if err := store.SetKubeconfigs([]string{"C:/kube/prod.yaml"}); err != nil {
		t.Fatal(err)
	}
	if err := store.SetClusterName("prod", "Production SGN"); err != nil {
		t.Fatal(err)
	}
	if err := store.SetForwards([]domain.ForwardSpec{forward}); err != nil {
		t.Fatal(err)
	}

	restarted := NewStore()
	if paths := restarted.Kubeconfigs(); len(paths) != 1 || paths[0] != "C:/kube/prod.yaml" {
		t.Errorf("kubeconfigs = %+v", paths)
	}
	if names := restarted.ClusterNames(); names["prod"] != "Production SGN" {
		t.Errorf("cluster names = %+v", names)
	}
	if forwards := restarted.Forwards(); len(forwards) != 1 || forwards[0].LocalPort != 34567 {
		t.Errorf("forwards = %+v", forwards)
	}
}

func TestAnEmptyClusterNameForgetsIt(t *testing.T) {
	isolate(t)
	store := NewStore()

	if err := store.SetClusterName("prod", "Production SGN"); err != nil {
		t.Fatal(err)
	}
	if err := store.SetClusterName("prod", ""); err != nil {
		t.Fatal(err)
	}

	if names := NewStore().ClusterNames(); len(names) != 0 {
		t.Errorf("cluster names = %+v, want the entry gone", names)
	}
}

func TestACorruptSettingsFileIsIgnored(t *testing.T) {
	isolate(t)

	dir, err := Dir()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, fileName), []byte("{not json"), 0o600); err != nil {
		t.Fatal(err)
	}

	store := NewStore()
	if paths := store.Kubeconfigs(); len(paths) != 0 {
		t.Errorf("kubeconfigs = %+v, want the unreadable file ignored", paths)
	}
	if err := store.SetKubeconfigs([]string{"C:/kube/prod.yaml"}); err != nil {
		t.Errorf("a corrupt file should be overwritten by the next save: %v", err)
	}
}

func TestNoConfigDirIsAnError(t *testing.T) {
	store := &Store{err: os.ErrNotExist}

	if _, err := store.Dir(); err == nil {
		t.Error("Dir() should report why there is nowhere to write")
	}
	if err := store.SetKubeconfigs([]string{"C:/kube/prod.yaml"}); err == nil {
		t.Error("saving with nowhere to write should fail")
	}
}
