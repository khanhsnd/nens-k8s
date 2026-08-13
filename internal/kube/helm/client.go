package helm

import (
	"fmt"
	"sort"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/kube"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
	"sigs.k8s.io/yaml"
)

type Clusters interface {
	Connection(id string) (*cluster.Connection, bool)
}

// Client answers one Helm question at a time. Helm keeps its state in the
// cluster — one Secret per revision — so there is nothing to cache here: an
// `action.Configuration` is a handful of structs over clients the connection
// already holds, and building one per call is cheaper than invalidating one.
type Client struct {
	clusters Clusters
}

func NewClient(clusters Clusters) *Client { return &Client{clusters: clusters} }

// Releases lists every namespace: the frontend filters the table the same way it
// filters an informer's rows, so the backend has no namespace to be told about.
func (c *Client) Releases(clusterID string) ([]domain.HelmRelease, error) {
	cfg, err := c.config(clusterID, "")
	if err != nil {
		return nil, err
	}

	list := action.NewList(cfg)
	// Every state, not just deployed — a failed or pending release is exactly the
	// one worth looking at. `Run` still reduces each release to its latest
	// revision, so this stays one row per release.
	list.All = true
	list.SetStateMask()

	found, err := list.Run()
	if err != nil {
		return nil, err
	}
	return rows(clusterID, found), nil
}

func (c *Client) History(ref domain.HelmRef) ([]domain.HelmRelease, error) {
	cfg, err := c.config(ref.ClusterID, ref.Namespace)
	if err != nil {
		return nil, err
	}

	found, err := action.NewHistory(cfg).Run(ref.Name)
	if err != nil {
		return nil, err
	}

	history := rows(ref.ClusterID, found)
	sort.Slice(history, func(a, b int) bool { return history[a].Revision > history[b].Revision })
	return history, nil
}

// Detail reads one revision; revision 0 is the current one.
func (c *Client) Detail(ref domain.HelmRef, revision int) (domain.HelmDetail, error) {
	cfg, err := c.config(ref.ClusterID, ref.Namespace)
	if err != nil {
		return domain.HelmDetail{}, err
	}

	get := action.NewGet(cfg)
	get.Version = revision

	rel, err := get.Run(ref.Name)
	if err != nil {
		return domain.HelmDetail{}, err
	}

	detail := domain.HelmDetail{
		Release:  row(ref.ClusterID, rel),
		Values:   values(rel.Config),
		Manifest: rel.Manifest,
	}
	if rel.Info != nil {
		detail.Notes = rel.Info.Notes
	}
	return detail, nil
}

func (c *Client) Rollback(ref domain.HelmRef, revision int) error {
	cfg, err := c.config(ref.ClusterID, ref.Namespace)
	if err != nil {
		return err
	}

	rollback := action.NewRollback(cfg)
	rollback.Version = revision
	return rollback.Run(ref.Name)
}

func (c *Client) Uninstall(ref domain.HelmRef) error {
	cfg, err := c.config(ref.ClusterID, ref.Namespace)
	if err != nil {
		return err
	}

	uninstall := action.NewUninstall(cfg)
	uninstall.DeletionPropagation = "background"

	_, err = uninstall.Run(ref.Name)
	return err
}

// config builds helm's world from the connection instead of letting helm dial
// its own: the release history is read through the connection's clientset, which
// is what makes every read here testable against a fake one. An empty namespace
// means every namespace, because that is what a namespaced client does with it.
//
// Only the Secret storage driver is supported — it is helm's default, and the
// alternatives (configmaps, sql) would each be a second thing to keep working.
func (c *Client) config(clusterID string, namespace string) (*action.Configuration, error) {
	conn, ok := c.clusters.Connection(clusterID)
	if !ok {
		return nil, fmt.Errorf("cluster %q is not connected", clusterID)
	}

	target := getter{conn: conn, namespace: namespace}
	return &action.Configuration{
		RESTClientGetter: target,
		KubeClient:       kube.New(target),
		Releases:         storage.Init(driver.NewSecrets(conn.Clientset().CoreV1().Secrets(namespace))),
		Log:              func(string, ...any) {},
	}, nil
}

func rows(clusterID string, found []*release.Release) []domain.HelmRelease {
	out := make([]domain.HelmRelease, 0, len(found))
	for _, rel := range found {
		out = append(out, row(clusterID, rel))
	}
	return out
}

func row(clusterID string, rel *release.Release) domain.HelmRelease {
	out := domain.HelmRelease{
		ClusterID: clusterID,
		Namespace: rel.Namespace,
		Name:      rel.Name,
		Revision:  rel.Version,
	}

	if rel.Info != nil {
		out.Status = rel.Info.Status.String()
		out.Description = rel.Info.Description
		if !rel.Info.LastDeployed.IsZero() {
			out.Updated = rel.Info.LastDeployed.UTC().Format(time.RFC3339)
		}
	}
	if rel.Chart != nil && rel.Chart.Metadata != nil {
		out.Chart = rel.Chart.Metadata.Name
		out.ChartVersion = rel.Chart.Metadata.Version
		out.AppVersion = rel.Chart.Metadata.AppVersion
	}
	return out
}

// The values the release was installed with, as the YAML they were written in.
// A release that took the chart's defaults has none, and marshalling that would
// send "{}" into a diff that is meant to read as empty.
func values(config map[string]any) string {
	if len(config) == 0 {
		return ""
	}

	out, err := yaml.Marshal(config)
	if err != nil {
		return ""
	}
	return string(out)
}
