package helm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	"helm.sh/helm/v3/pkg/chart"
	"helm.sh/helm/v3/pkg/release"
	"helm.sh/helm/v3/pkg/storage"
	"helm.sh/helm/v3/pkg/storage/driver"
	helmtime "helm.sh/helm/v3/pkg/time"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
)

type clusters map[string]*cluster.Connection

func (c clusters) Connection(id string) (*cluster.Connection, bool) {
	conn, ok := c[id]
	return conn, ok
}

// Helm asks whether the cluster is reachable before every action, and that is
// one call to /version — the rest of a read goes through the clientset, which is
// the fake one.
func reachable(t *testing.T) *rest.Config {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"major":"1","minor":"34","gitVersion":"v1.34.0"}`))
	}))
	t.Cleanup(server.Close)

	return &rest.Config{Host: server.URL}
}

func connect(t *testing.T, clientset kubernetes.Interface) *Client {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "kind"}, cluster.Clients{
		Config:    reachable(t),
		Clientset: clientset,
	})
	return NewClient(clusters{"kind": conn})
}

func revision(name string, namespace string, version int, status release.Status) *release.Release {
	return &release.Release{
		Name:      name,
		Namespace: namespace,
		Version:   version,
		Info: &release.Info{
			Status:       status,
			Description:  "Upgrade complete",
			LastDeployed: helmtime.Time{Time: time.Date(2026, 3, 1, 10, 0, version, 0, time.UTC)},
		},
		Chart: &chart.Chart{Metadata: &chart.Metadata{
			Name:       name,
			Version:    "1.0.0",
			AppVersion: "2.3.4",
		}},
		Config:   map[string]any{"replicaCount": version},
		Manifest: "kind: Deployment\n",
	}
}

// Seeded through helm's own driver, so the Secrets are shaped exactly like the
// ones a real `helm install` leaves behind.
func seed(t *testing.T, clientset kubernetes.Interface, releases ...*release.Release) {
	t.Helper()

	for _, rel := range releases {
		store := storage.Init(driver.NewSecrets(clientset.CoreV1().Secrets(rel.Namespace)))
		if err := store.Create(rel); err != nil {
			t.Fatalf("seed %s/%s v%d: %v", rel.Namespace, rel.Name, rel.Version, err)
		}
	}
}

func TestReleasesListsLatestRevisionOfEveryNamespace(t *testing.T) {
	clientset := fake.NewSimpleClientset()
	seed(t,
		clientset,
		revision("web", "demo", 1, release.StatusSuperseded),
		revision("web", "demo", 2, release.StatusDeployed),
		revision("cache", "infra", 1, release.StatusFailed),
	)

	found, err := connect(t, clientset).Releases("kind")
	if err != nil {
		t.Fatalf("Releases: %v", err)
	}

	if len(found) != 2 {
		t.Fatalf("want one row per release, got %d: %+v", len(found), found)
	}

	byName := make(map[string]domain.HelmRelease, len(found))
	for _, item := range found {
		byName[item.Name] = item
	}

	web := byName["web"]
	if web.Revision != 2 || web.Status != "deployed" || web.Namespace != "demo" {
		t.Errorf("web: got %+v", web)
	}
	if web.Chart != "web" || web.ChartVersion != "1.0.0" || web.AppVersion != "2.3.4" {
		t.Errorf("web chart: got %+v", web)
	}
	if web.Updated != "2026-03-01T10:00:02Z" {
		t.Errorf("web updated: got %q", web.Updated)
	}
	if web.ClusterID != "kind" {
		t.Errorf("web cluster: got %q", web.ClusterID)
	}

	// A failed release is the one worth seeing, so the list is not filtered to
	// deployed.
	if byName["cache"].Status != "failed" {
		t.Errorf("cache: got %+v", byName["cache"])
	}
}

func TestHistoryIsNewestFirst(t *testing.T) {
	clientset := fake.NewSimpleClientset()
	seed(t,
		clientset,
		revision("web", "demo", 1, release.StatusSuperseded),
		revision("web", "demo", 2, release.StatusSuperseded),
		revision("web", "demo", 3, release.StatusDeployed),
		revision("cache", "infra", 1, release.StatusDeployed),
	)

	found, err := connect(t, clientset).History(domain.HelmRef{
		ClusterID: "kind",
		Namespace: "demo",
		Name:      "web",
	})
	if err != nil {
		t.Fatalf("History: %v", err)
	}

	revisions := make([]int, 0, len(found))
	for _, item := range found {
		revisions = append(revisions, item.Revision)
	}
	if len(revisions) != 3 || revisions[0] != 3 || revisions[2] != 1 {
		t.Fatalf("want revisions 3,2,1, got %v", revisions)
	}
}

func TestDetailReadsOneRevision(t *testing.T) {
	clientset := fake.NewSimpleClientset()
	seed(t,
		clientset,
		revision("web", "demo", 1, release.StatusSuperseded),
		revision("web", "demo", 2, release.StatusDeployed),
	)

	client := connect(t, clientset)
	ref := domain.HelmRef{ClusterID: "kind", Namespace: "demo", Name: "web"}

	older, err := client.Detail(ref, 1)
	if err != nil {
		t.Fatalf("Detail(1): %v", err)
	}
	if older.Release.Revision != 1 || older.Values != "replicaCount: 1\n" {
		t.Errorf("revision 1: got %+v", older)
	}

	// Revision 0 is "whatever is current", which is what the drawer opens with.
	current, err := client.Detail(ref, 0)
	if err != nil {
		t.Fatalf("Detail(0): %v", err)
	}
	if current.Release.Revision != 2 || current.Values != "replicaCount: 2\n" {
		t.Errorf("current: got %+v", current)
	}
	if current.Manifest != "kind: Deployment\n" {
		t.Errorf("manifest: got %q", current.Manifest)
	}
}

// A release installed with the chart's defaults has no values, and "{}" in a
// diff reads as a change that is not there.
func TestDetailLeavesDefaultValuesEmpty(t *testing.T) {
	clientset := fake.NewSimpleClientset()
	bare := revision("web", "demo", 1, release.StatusDeployed)
	bare.Config = nil
	seed(t, clientset, bare)

	detail, err := connect(t, clientset).Detail(domain.HelmRef{
		ClusterID: "kind",
		Namespace: "demo",
		Name:      "web",
	}, 0)
	if err != nil {
		t.Fatalf("Detail: %v", err)
	}
	if detail.Values != "" {
		t.Errorf("want no values, got %q", detail.Values)
	}
}

func TestReleasesRejectsUnconnectedCluster(t *testing.T) {
	if _, err := connect(t, fake.NewSimpleClientset()).Releases("other"); err == nil {
		t.Fatal("want an error for a cluster that is not connected")
	}
}
