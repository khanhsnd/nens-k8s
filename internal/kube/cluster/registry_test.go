package cluster

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
	"time"

	"nens-k8s/internal/domain"

	"k8s.io/client-go/rest"
)

type source struct {
	mu       sync.Mutex
	clusters []domain.Cluster
	host     string
	fail     error
}

func (s *source) Clusters() ([]domain.Cluster, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return slices.Clone(s.clusters), nil
}

func (s *source) RESTConfig(_ string) (*rest.Config, error) {
	if s.fail != nil {
		return nil, s.fail
	}
	return &rest.Config{Host: s.host}, nil
}

func (s *source) Rename(id string, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.clusters {
		if s.clusters[i].ID == id {
			s.clusters[i].Name = name
			return nil
		}
	}
	return errors.New("no such cluster")
}

type recorder struct {
	changes chan domain.Cluster
}

func (r *recorder) Publish(_ string, payload any) {
	r.changes <- payload.(domain.Cluster)
}

func (r *recorder) next(t *testing.T) domain.Cluster {
	t.Helper()

	select {
	case meta := <-r.changes:
		return meta
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for a cluster event")
		return domain.Cluster{}
	}
}

func (r *recorder) quiet(t *testing.T) {
	t.Helper()

	select {
	case meta := <-r.changes:
		t.Fatalf("published %+v, want nothing", meta)
	case <-time.After(200 * time.Millisecond):
	}
}

func apiServer(t *testing.T) *httptest.Server {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/version" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"major":"1","minor":"31","gitVersion":"v1.31.4"}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func newRegistry(t *testing.T, host string) (*Registry, *recorder, *source) {
	t.Helper()

	from := &source{
		host: host,
		clusters: []domain.Cluster{
			{ID: "prod", Name: "prod", Context: "prod", Server: host, Phase: domain.PhaseDisconnected},
			{ID: "staging", Name: "staging", Context: "staging", Server: host, Phase: domain.PhaseDisconnected},
		},
	}
	bus := &recorder{changes: make(chan domain.Cluster, 32)}
	registry := NewRegistry(from, bus)
	t.Cleanup(registry.Shutdown)

	return registry, bus, from
}

func TestConnectPublishesConnectingThenConnected(t *testing.T) {
	registry, bus, _ := newRegistry(t, apiServer(t).URL)

	meta, err := registry.Connect(context.Background(), "prod")
	if err != nil {
		t.Fatal(err)
	}
	if meta.Phase != domain.PhaseConnected || meta.Version != "v1.31.4" {
		t.Fatalf("Connect() = %+v", meta)
	}

	if first := bus.next(t); first.Phase != domain.PhaseConnecting {
		t.Errorf("first event = %+v, want connecting", first)
	}
	if second := bus.next(t); second.Phase != domain.PhaseConnected || second.Version != "v1.31.4" {
		t.Errorf("second event = %+v, want connected", second)
	}

	if _, ok := registry.Get("prod"); !ok {
		t.Error("a connected cluster should be in the registry")
	}
}

func TestConnectingTwiceKeepsTheSameConnection(t *testing.T) {
	registry, bus, _ := newRegistry(t, apiServer(t).URL)

	if _, err := registry.Connect(context.Background(), "prod"); err != nil {
		t.Fatal(err)
	}
	first, _ := registry.Connection("prod")
	bus.next(t)
	bus.next(t)

	if _, err := registry.Connect(context.Background(), "prod"); err != nil {
		t.Fatal(err)
	}
	second, _ := registry.Connection("prod")

	if first != second {
		t.Error("the second Connect should reuse the live connection")
	}
	bus.quiet(t)
}

func TestConnectPublishesWhatWentWrong(t *testing.T) {
	dead := apiServer(t)
	dead.Close()

	tests := []struct {
		name     string
		host     string
		fail     error
		id       string
		reported bool
	}{
		{name: "no rest config", host: dead.URL, fail: errors.New("no such user"), id: "prod", reported: true},
		{name: "server unreachable", host: dead.URL, id: "prod", reported: true},
		{name: "unknown cluster", host: dead.URL, id: "ghost"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			registry, bus, from := newRegistry(t, test.host)
			from.fail = test.fail

			if _, err := registry.Connect(context.Background(), test.id); err == nil {
				t.Fatal("Connect should have failed")
			}
			if _, ok := registry.Get(test.id); ok {
				t.Error("a failed connect must not register a connection")
			}

			if !test.reported {
				bus.quiet(t)
				return
			}
			if connecting := bus.next(t); connecting.Phase != domain.PhaseConnecting {
				t.Errorf("first event = %+v, want connecting", connecting)
			}
			failed := bus.next(t)
			if failed.Phase != domain.PhaseError || failed.Error == "" {
				t.Errorf("second event = %+v, want an error phase carrying the reason", failed)
			}
		})
	}
}

func TestDisconnectCancelsTheConnectionContext(t *testing.T) {
	registry, bus, _ := newRegistry(t, apiServer(t).URL)

	if _, err := registry.Connect(context.Background(), "prod"); err != nil {
		t.Fatal(err)
	}
	conn, _ := registry.Connection("prod")
	bus.next(t)
	bus.next(t)

	if err := registry.Disconnect("prod"); err != nil {
		t.Fatal(err)
	}

	select {
	case <-conn.Context().Done():
	case <-time.After(2 * time.Second):
		t.Fatal("disconnect should cancel everything hanging off the connection")
	}

	gone := bus.next(t)
	if gone.Phase != domain.PhaseDisconnected || gone.Version != "" {
		t.Errorf("event = %+v, want disconnected with no version", gone)
	}
	if _, ok := registry.Get("prod"); ok {
		t.Error("a disconnected cluster should be out of the registry")
	}
}

func TestDisconnectingWhatIsNotConnectedSaysNothing(t *testing.T) {
	registry, bus, _ := newRegistry(t, apiServer(t).URL)

	if err := registry.Disconnect("prod"); err != nil {
		t.Fatal(err)
	}
	bus.quiet(t)
}

func TestListOverlaysTheLiveStateOnTheKubeconfig(t *testing.T) {
	registry, bus, _ := newRegistry(t, apiServer(t).URL)

	if _, err := registry.Connect(context.Background(), "prod"); err != nil {
		t.Fatal(err)
	}
	bus.next(t)
	bus.next(t)

	clusters, err := registry.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(clusters) != 2 {
		t.Fatalf("List() = %+v, want both kubeconfig entries", clusters)
	}
	if clusters[0].Phase != domain.PhaseConnected || clusters[0].Version != "v1.31.4" {
		t.Errorf("connected entry = %+v", clusters[0])
	}
	if clusters[1].Phase != domain.PhaseDisconnected {
		t.Errorf("untouched entry = %+v, want the kubeconfig's own state", clusters[1])
	}
}

func TestRenameReachesTheLiveConnection(t *testing.T) {
	registry, bus, _ := newRegistry(t, apiServer(t).URL)

	if _, err := registry.Connect(context.Background(), "prod"); err != nil {
		t.Fatal(err)
	}
	bus.next(t)
	bus.next(t)

	meta, err := registry.Rename("prod", "Production SGN")
	if err != nil {
		t.Fatal(err)
	}
	if meta.Name != "Production SGN" || meta.Phase != domain.PhaseConnected {
		t.Fatalf("Rename() = %+v, want the new name on the live connection", meta)
	}
	if renamed := bus.next(t); renamed.Name != "Production SGN" {
		t.Errorf("event = %+v, want the new name", renamed)
	}

	conn, _ := registry.Connection("prod")
	if conn.Meta().Name != "Production SGN" {
		t.Errorf("connection name = %q", conn.Meta().Name)
	}
}

func TestShutdownClosesEveryConnection(t *testing.T) {
	registry, bus, _ := newRegistry(t, apiServer(t).URL)

	for _, id := range []string{"prod", "staging"} {
		if _, err := registry.Connect(context.Background(), id); err != nil {
			t.Fatal(err)
		}
		bus.next(t)
		bus.next(t)
	}

	prod, _ := registry.Connection("prod")
	staging, _ := registry.Connection("staging")
	registry.Shutdown()

	for name, conn := range map[string]*Connection{"prod": prod, "staging": staging} {
		select {
		case <-conn.Context().Done():
		case <-time.After(2 * time.Second):
			t.Errorf("%s was left open by Shutdown", name)
		}
	}
	if _, ok := registry.Get("prod"); ok {
		t.Error("Shutdown should empty the registry")
	}
}
