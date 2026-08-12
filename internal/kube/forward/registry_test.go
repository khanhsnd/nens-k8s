package forward

import (
	"context"
	"errors"
	"maps"
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

	registry := NewRegistry(clusters{conn: conn}, bus)
	registry.dial = func(
		_ *cluster.Connection,
		_ string,
		_ string,
		_ []string,
		stop <-chan struct{},
		ready chan struct{},
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
