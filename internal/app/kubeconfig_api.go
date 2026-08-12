package app

import (
	"context"
	"os"
	"path/filepath"

	"nens-k8s/internal/domain"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type KubeconfigAPI struct {
	files domain.KubeconfigFiles
	ctx   context.Context
}

func NewKubeconfigAPI(files domain.KubeconfigFiles) *KubeconfigAPI {
	return &KubeconfigAPI{files: files}
}

func (a *KubeconfigAPI) bind(ctx context.Context) {
	a.ctx = ctx
}

func (a *KubeconfigAPI) List() []domain.KubeconfigFile {
	return a.files.Files()
}

func (a *KubeconfigAPI) Pick() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Select a kubeconfig",
		DefaultDirectory: defaultKubeDir(),
		Filters: []runtime.FileFilter{
			{DisplayName: "Kubeconfig", Pattern: "*.yaml;*.yml;*.conf;config"},
			{DisplayName: "All files", Pattern: "*.*"},
		},
	})
}

func (a *KubeconfigAPI) Add(path string) (domain.KubeconfigFile, error) {
	return a.files.Add(path)
}

func (a *KubeconfigAPI) Import(content string) (domain.KubeconfigFile, error) {
	return a.files.Import(content)
}

func (a *KubeconfigAPI) Remove(path string) error {
	return a.files.Remove(path)
}

func defaultKubeDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	dir := filepath.Join(home, ".kube")
	if _, err := os.Stat(dir); err != nil {
		return ""
	}
	return dir
}
