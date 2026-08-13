package app

import (
	"nens-k8s/internal/domain"
)

// HelmAPI binds no context: `domain.HelmClient` takes none, because helm's own
// action API takes none.
type HelmAPI struct {
	helm domain.HelmClient
}

func NewHelmAPI(helm domain.HelmClient) *HelmAPI {
	return &HelmAPI{helm: helm}
}

func (a *HelmAPI) Releases(clusterID string) ([]domain.HelmRelease, error) {
	return a.helm.Releases(clusterID)
}

func (a *HelmAPI) History(ref domain.HelmRef) ([]domain.HelmRelease, error) {
	return a.helm.History(ref)
}

func (a *HelmAPI) Detail(ref domain.HelmRef, revision int) (domain.HelmDetail, error) {
	return a.helm.Detail(ref, revision)
}

func (a *HelmAPI) Rollback(ref domain.HelmRef, revision int) error {
	return a.helm.Rollback(ref, revision)
}

func (a *HelmAPI) Uninstall(ref domain.HelmRef) error {
	return a.helm.Uninstall(ref)
}
