package forward

import (
	"context"
	"errors"
	"io"
	"maps"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"
	"nens-k8s/internal/kube/pods"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/tools/portforward"
)

var servicesGVR = schema.GroupVersionResource{Version: "v1", Resource: "services"}

type recorder struct {
	forwards chan domain.PortForward
}

func (r *recorder) Publish(_ string, payload any) {
	r.forwards <- payload.(domain.PortForward)
}

func (r *recorder) next(t *testing.T) domain.PortForward {
	t.Helper()

	select {
	case meta := <-r.forwards:
		return meta
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for a forward event")
		return domain.PortForward{}
	}
}

// specs stands in for the settings file. It locks because `remember` runs on the
// goroutine that waits for the local port.
type specs struct {
	mu    sync.Mutex
	saved []domain.ForwardSpec
}

func (s *specs) Forwards() []domain.ForwardSpec {
	s.mu.Lock()
	defer s.mu.Unlock()

	return slices.Clone(s.saved)
}

func (s *specs) SetForwards(next []domain.ForwardSpec) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.saved = next
	return nil
}

type clusters struct {
	conn *cluster.Connection
}

func (c clusters) Connection(id string) (*cluster.Connection, bool) {
	return c.conn, id == "test"
}

// pipe stands in for client-go's PortForwarder: it reports ready, then holds the
// tunnel open until the registry closes the stop channel.
type pipe struct {
	stop  <-chan struct{}
	ready chan struct{}
	local uint16
	fail  error
}

func (p *pipe) ForwardPorts() error {
	if p.fail != nil {
		return p.fail
	}
	close(p.ready)
	<-p.stop
	return nil
}

func (p *pipe) GetPorts() ([]portforward.ForwardedPort, error) {
	return []portforward.ForwardedPort{{Local: p.local, Remote: 8080}}, nil
}

func object(apiVersion string, kind string, name string, extra map[string]any) *unstructured.Unstructured {
	item := map[string]any{
		"apiVersion": apiVersion,
		"kind":       kind,
		"metadata": map[string]any{
			"name":      name,
			"namespace": "default",
			"uid":       "uid-" + name,
			"labels":    map[string]any{"app": "api"},
		},
	}
	maps.Copy(item, extra)
	return &unstructured.Unstructured{Object: item}
}

func podObject(name string, phase string) *unstructured.Unstructured {
	return object("v1", "Pod", name, map[string]any{
		"spec": map[string]any{
			"containers": []any{map[string]any{
				"name": "api",
				"ports": []any{map[string]any{
					"name":          "http",
					"containerPort": int64(8080),
					"protocol":      "TCP",
				}},
			}},
		},
		"status": map[string]any{"phase": phase},
	})
}

func newRegistry(t *testing.T, fail error, objects ...runtime.Object) (*Registry, *recorder, context.CancelFunc) {
	t.Helper()

	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			pods.GVR:    "PodList",
			servicesGVR: "ServiceList",
		},
		objects...,
	)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{Dynamic: dyn})
	bus := &recorder{forwards: make(chan domain.PortForward, 32)}

	registry := NewRegistry(clusters{conn: conn}, bus, &specs{})
	registry.dial = func(
		_ *cluster.Connection,
		_ string,
		_ string,
		_ []string,
		stop <-chan struct{},
		ready chan struct{},
		_ io.Writer,
	) (tunnel, error) {
		return &pipe{stop: stop, ready: ready, local: 34567, fail: fail}, nil
	}
	return registry, bus, cancel
}

func ref(resource string, name string) domain.ResourceRef {
	return domain.ResourceRef{
		ClusterID: "test",
		GVR:       domain.GVR{Version: "v1", Resource: resource},
		Namespace: "default",
		Name:      name,
	}
}

func TestStartReportsTheLocalPortTheKernelPicked(t *testing.T) {
	registry, bus, _ := newRegistry(t, nil, podObject("api-1", "Running"))

	meta, err := registry.Start(context.Background(), ref("pods", "api-1"), 0, 8080)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Status != domain.ForwardStarting || meta.Pod != "api-1" {
		t.Fatalf("first state = %+v", meta)
	}

	active := bus.next(t)
	if active.Status != domain.ForwardActive || active.LocalPort != 34567 || active.RemotePort != 8080 {
		t.Fatalf("active state = %+v", active)
	}

	listed := registry.List()
	if len(listed) != 1 || listed[0].LocalPort != 34567 {
		t.Fatalf("List() = %+v", listed)
	}
}

func saved(t *testing.T, registry *Registry) []domain.ForwardSpec {
	t.Helper()

	store, ok := registry.store.(*specs)
	if !ok {
		t.Fatalf("store = %T, want *specs", registry.store)
	}
	return store.Forwards()
}

func TestAStartedForwardIsRememberedWithThePortTheKernelPicked(t *testing.T) {
	registry, bus, _ := newRegistry(t, nil, podObject("api-1", "Running"))

	if _, err := registry.Start(context.Background(), ref("pods", "api-1"), 0, 8080); err != nil {
		t.Fatal(err)
	}
	bus.next(t)

	remembered := saved(t, registry)
	if len(remembered) != 1 {
		t.Fatalf("remembered = %+v, want one spec", remembered)
	}
	if remembered[0].LocalPort != 34567 || remembered[0].RemotePort != 8080 {
		t.Errorf("remembered ports = %+v, want 34567:8080", remembered[0])
	}
	if remembered[0].Ref.UID != "" {
		t.Errorf("remembered uid = %q, want it dropped", remembered[0].Ref.UID)
	}
}

func TestAForwardThatDiesWithItsClusterStaysRemembered(t *testing.T) {
	registry, bus, disconnect := newRegistry(t, nil, podObject("api-1", "Running"))

	if _, err := registry.Start(context.Background(), ref("pods", "api-1"), 8080, 8080); err != nil {
		t.Fatal(err)
	}
	bus.next(t)

	disconnect()
	bus.next(t)

	if remembered := saved(t, registry); len(remembered) != 1 {
		t.Errorf("remembered = %+v, want it kept for the next connect", remembered)
	}
}

func TestRestoreStartsEachRememberedForwardOnce(t *testing.T) {
	registry, bus, _ := newRegistry(t, nil, podObject("api-1", "Running"))
	_ = registry.store.SetForwards([]domain.ForwardSpec{
		{Ref: ref("pods", "api-1"), LocalPort: 34567, RemotePort: 8080},
		{Ref: ref("pods", "api-1"), LocalPort: 0, RemotePort: 9090},
	})

	restored, err := registry.Restore(context.Background(), "test")
	if err != nil {
		t.Fatal(err)
	}
	if len(restored) != 2 {
		t.Fatalf("restored = %+v, want both", restored)
	}
	bus.next(t)
	bus.next(t)

	again, err := registry.Restore(context.Background(), "test")
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 0 {
		t.Errorf("a second restore started %+v, want nothing — they are already up", again)
	}
}

func TestRestoreSkipsOtherClusters(t *testing.T) {
	registry, _, _ := newRegistry(t, nil, podObject("api-1", "Running"))

	elsewhere := ref("pods", "api-1")
	elsewhere.ClusterID = "other"
	_ = registry.store.SetForwards([]domain.ForwardSpec{{Ref: elsewhere, RemotePort: 8080}})

	restored, err := registry.Restore(context.Background(), "test")
	if err != nil || len(restored) != 0 {
		t.Errorf("restored = %+v, err = %v, want nothing", restored, err)
	}
}

func TestRestoreReportsWhatItCouldNotBringBack(t *testing.T) {
	registry, _, _ := newRegistry(t, nil, podObject("api-1", "Pending"))
	spec := domain.ForwardSpec{Ref: ref("pods", "api-1"), LocalPort: 34567, RemotePort: 8080}
	_ = registry.store.SetForwards([]domain.ForwardSpec{spec})

	restored, err := registry.Restore(context.Background(), "test")
	if err != nil {
		t.Fatal(err)
	}
	if len(restored) != 1 {
		t.Fatalf("restored = %+v, want the failure reported as a record", restored)
	}
	if restored[0].Status != domain.ForwardError || restored[0].Error == "" {
		t.Errorf("record = %+v, want an error the view can show", restored[0])
	}
	if restored[0].RemotePort != 8080 || restored[0].Name != "api-1" {
		t.Errorf("record = %+v, want it to name the forward that failed", restored[0])
	}
	if remembered := saved(t, registry); len(remembered) != 1 {
		t.Errorf("remembered = %+v, want the spec kept for the next connect", remembered)
	}

	again, err := registry.Restore(context.Background(), "test")
	if err != nil {
		t.Fatal(err)
	}
	if len(again) != 1 || again[0].ID != restored[0].ID {
		t.Errorf("second restore = %+v, want the same record updated, not a second one", again)
	}

	if err := registry.Stop(restored[0].ID); err != nil {
		t.Fatal(err)
	}
	if remembered := saved(t, registry); len(remembered) != 0 {
		t.Errorf("remembered = %+v, want stopping the failed row to forget it", remembered)
	}
	if listed := registry.List(); len(listed) != 0 {
		t.Errorf("List() = %+v, want the failed row gone", listed)
	}
}

func TestAConnectionErrorLandsOnTheForwardWithoutEndingIt(t *testing.T) {
	registry, bus, _ := newRegistry(t, nil, podObject("api-1", "Running"))

	// The stream client-go writes its per-connection errors to, held so the test
	// can write what a refused connection would have put there.
	streams := make(chan io.Writer, 1)
	dial := registry.dial
	registry.dial = func(
		conn *cluster.Connection,
		namespace string,
		pod string,
		ports []string,
		stop <-chan struct{},
		ready chan struct{},
		stream io.Writer,
	) (tunnel, error) {
		streams <- stream
		return dial(conn, namespace, pod, ports, stop, ready, stream)
	}

	if _, err := registry.Start(context.Background(), ref("pods", "api-1"), 0, 8080); err != nil {
		t.Fatal(err)
	}
	bus.next(t)

	_, _ = (<-streams).Write([]byte("an error occurred forwarding 34567 -> 8080: connection refused\n"))

	troubled := bus.next(t)
	if troubled.Status != domain.ForwardActive {
		t.Errorf("status = %q, want the tunnel left up", troubled.Status)
	}
	if !strings.Contains(troubled.Error, "connection refused") {
		t.Errorf("error = %q, want the message client-go wrote", troubled.Error)
	}
}

func TestStopEndsTheForwardAndForgetsIt(t *testing.T) {
	registry, bus, _ := newRegistry(t, nil, podObject("api-1", "Running"))

	meta, err := registry.Start(context.Background(), ref("pods", "api-1"), 8080, 8080)
	if err != nil {
		t.Fatal(err)
	}
	bus.next(t)

	if err := registry.Stop(meta.ID); err != nil {
		t.Fatal(err)
	}
	if stopped := bus.next(t); stopped.Status != domain.ForwardStopped {
		t.Errorf("final state = %+v, want stopped", stopped)
	}
	if listed := registry.List(); len(listed) != 0 {
		t.Errorf("List() = %+v, want empty", listed)
	}
	if remembered := saved(t, registry); len(remembered) != 0 {
		t.Errorf("remembered = %+v, want it forgotten", remembered)
	}
}

func TestAForwardThatFailsToDialReportsTheError(t *testing.T) {
	registry, bus, _ := newRegistry(t, errors.New("unable to listen on port 8080"), podObject("api-1", "Running"))

	if _, err := registry.Start(context.Background(), ref("pods", "api-1"), 8080, 8080); err != nil {
		t.Fatal(err)
	}

	failed := bus.next(t)
	if failed.Status != domain.ForwardError || failed.Error == "" {
		t.Fatalf("final state = %+v, want an error", failed)
	}
	if listed := registry.List(); len(listed) != 0 {
		t.Errorf("List() = %+v, want empty", listed)
	}
}

func TestDisconnectingTheClusterStopsItsForwards(t *testing.T) {
	registry, bus, disconnect := newRegistry(t, nil, podObject("api-1", "Running"))

	if _, err := registry.Start(context.Background(), ref("pods", "api-1"), 8080, 8080); err != nil {
		t.Fatal(err)
	}
	bus.next(t)

	disconnect()
	if stopped := bus.next(t); stopped.Status != domain.ForwardStopped {
		t.Errorf("final state = %+v, want stopped", stopped)
	}
}

func TestStartForwardsToTheServicesRunningPod(t *testing.T) {
	service := object("v1", "Service", "api", map[string]any{
		"spec": map[string]any{
			"selector": map[string]any{"app": "api"},
			"ports":    []any{map[string]any{"name": "http", "port": int64(80), "targetPort": int64(8080)}},
		},
	})
	registry, _, _ := newRegistry(t, nil, service, podObject("api-1", "Pending"), podObject("api-2", "Running"))

	meta, err := registry.Start(context.Background(), ref("services", "api"), 0, 8080)
	if err != nil {
		t.Fatal(err)
	}
	if meta.Pod != "api-2" {
		t.Errorf("pod = %q, want the running one (api-2)", meta.Pod)
	}
}

func TestStartRefusesWhatItCannotForward(t *testing.T) {
	registry, _, _ := newRegistry(t, nil, podObject("api-1", "Pending"))

	if _, err := registry.Start(context.Background(), ref("pods", "api-1"), 0, 0); err == nil {
		t.Error("a forward without a remote port should fail")
	}
	if _, err := registry.Start(context.Background(), ref("pods", "api-1"), 0, 8080); err == nil {
		t.Error("forwarding to a pod that is not running should fail")
	}

	elsewhere := ref("pods", "api-1")
	elsewhere.ClusterID = "other"
	if _, err := registry.Start(context.Background(), elsewhere, 0, 8080); err == nil {
		t.Error("forwarding on a cluster that is not connected should fail")
	}
}

func TestPortsReadsThePodSideNumbers(t *testing.T) {
	service := object("v1", "Service", "api", map[string]any{
		"spec": map[string]any{
			"selector": map[string]any{"app": "api"},
			"ports": []any{
				map[string]any{"name": "http", "port": int64(80), "targetPort": int64(8080), "protocol": "TCP"},
				map[string]any{"name": "metrics", "port": int64(9090)},
			},
		},
	})
	registry, _, _ := newRegistry(t, nil, service, podObject("api-1", "Running"))

	fromService, err := registry.Ports(context.Background(), ref("services", "api"))
	if err != nil {
		t.Fatal(err)
	}
	want := []domain.ForwardPort{
		{Name: "http", Port: 8080, Protocol: "TCP"},
		{Name: "metrics", Port: 9090},
	}
	if len(fromService) != len(want) {
		t.Fatalf("service ports = %+v", fromService)
	}
	for i, port := range fromService {
		if port != want[i] {
			t.Errorf("service port %d = %+v, want %+v", i, port, want[i])
		}
	}

	fromPod, err := registry.Ports(context.Background(), ref("pods", "api-1"))
	if err != nil {
		t.Fatal(err)
	}
	if len(fromPod) != 1 || fromPod[0].Port != 8080 || fromPod[0].Name != "http" {
		t.Errorf("pod ports = %+v", fromPod)
	}
}
