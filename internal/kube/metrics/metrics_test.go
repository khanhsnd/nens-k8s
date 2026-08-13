package metrics

import (
	"context"
	"testing"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

type clusters struct {
	conn *cluster.Connection
}

func (c clusters) Connection(id string) (*cluster.Connection, bool) {
	return c.conn, id == "test"
}

type harness struct {
	reader  *Reader
	dynamic *dynamicfake.FakeDynamicClient
}

func newReader(t *testing.T) harness {
	t.Helper()

	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			nodeMetrics: "NodeMetricsList",
			podMetrics:  "PodMetricsList",
		},
	)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{Dynamic: client})
	return harness{reader: NewReader(clusters{conn: conn}), dynamic: client}
}

// The fake client's object tracker guesses a resource name from an object's
// kind, and `NodeMetrics` does not guess to `nodes` — so the lists are served
// directly rather than seeded, which is also what lets a list fail on demand.
func (h harness) serve(resource string, items ...unstructured.Unstructured) {
	h.dynamic.PrependReactor("list", resource, func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, &unstructured.UnstructuredList{Items: items}, nil
	})
}

func (h harness) fail(resource string, err error) {
	h.dynamic.PrependReactor("list", resource, func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, err
	})
}

func (h harness) serveOne(resource string, item unstructured.Unstructured) {
	h.dynamic.PrependReactor("get", resource, func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, &item, nil
	})
}

func (h harness) failOne(resource string, err error) {
	h.dynamic.PrependReactor("get", resource, func(k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, err
	})
}

func nodeSample(name string, cpu string, memory string) unstructured.Unstructured {
	return unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "metrics.k8s.io/v1beta1",
		"kind":       "NodeMetrics",
		"metadata":   map[string]any{"name": name},
		"usage":      map[string]any{"cpu": cpu, "memory": memory},
	}}
}

func podSample(namespace string, name string, containers ...any) unstructured.Unstructured {
	return unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "metrics.k8s.io/v1beta1",
		"kind":       "PodMetrics",
		"metadata":   map[string]any{"name": name, "namespace": namespace},
		"containers": containers,
	}}
}

func container(name string, cpu string, memory string) any {
	return map[string]any{"name": name, "usage": map[string]any{"cpu": cpu, "memory": memory}}
}

func find(t *testing.T, usage []domain.Usage, name string) domain.Usage {
	t.Helper()

	for _, item := range usage {
		if item.Name == name {
			return item
		}
	}
	t.Fatalf("%s is missing from %+v", name, usage)
	return domain.Usage{}
}

func TestNodeUsageIsMillicoresAndBytes(t *testing.T) {
	h := newReader(t)
	h.serve("nodes",
		nodeSample("node-1", "1930m", "7847356Ki"),
		nodeSample("node-2", "2", "3Gi"),
	)

	sample, err := h.reader.Sample(context.Background(), "test")
	if err != nil {
		t.Fatalf("Sample: %v", err)
	}
	if !sample.Available {
		t.Fatalf("expected an available sample, got %+v", sample)
	}

	node := find(t, sample.Nodes, "node-1")
	if node.CPUMilli != 1930 || node.MemoryBytes != 7847356*1024 {
		t.Errorf("node-1 = %+v", node)
	}
	if node.Namespace != "" {
		t.Errorf("a node is not namespaced: %+v", node)
	}

	// Whole cores and binary suffixes are the same unit once parsed.
	if node := find(t, sample.Nodes, "node-2"); node.CPUMilli != 2000 || node.MemoryBytes != 3*1024*1024*1024 {
		t.Errorf("node-2 = %+v", node)
	}
}

func TestPodUsageSumsItsContainers(t *testing.T) {
	h := newReader(t)
	h.serve("pods", podSample("default", "api",
		container("app", "120m", "256Mi"),
		container("sidecar", "30m", "64Mi"),
	))

	sample, err := h.reader.Sample(context.Background(), "test")
	if err != nil {
		t.Fatalf("Sample: %v", err)
	}

	pod := find(t, sample.Pods, "api")
	if pod.Namespace != "default" {
		t.Errorf("pod lost its namespace: %+v", pod)
	}
	if pod.CPUMilli != 150 || pod.MemoryBytes != 320*1024*1024 {
		t.Errorf("containers were not summed: %+v", pod)
	}
}

func TestPodSampleKeepsItsContainersApart(t *testing.T) {
	h := newReader(t)
	sample := podSample("default", "api",
		container("app", "120m", "256Mi"),
		container("sidecar", "30m", "64Mi"),
	)
	sample.Object["timestamp"] = "2026-08-13T09:00:00Z"
	sample.Object["window"] = "30s"
	h.serveOne("pods", sample)

	usage, err := h.reader.PodSample(context.Background(), "test", "default", "api")
	if err != nil {
		t.Fatalf("PodSample: %v", err)
	}
	if !usage.Available || usage.Timestamp != "2026-08-13T09:00:00Z" || usage.Window != "30s" {
		t.Fatalf("usage = %+v", usage)
	}
	if len(usage.Containers) != 2 {
		t.Fatalf("expected one entry per container, got %+v", usage.Containers)
	}

	app := find(t, usage.Containers, "app")
	if app.CPUMilli != 120 || app.MemoryBytes != 256*1024*1024 {
		t.Errorf("app = %+v", app)
	}
	if sidecar := find(t, usage.Containers, "sidecar"); sidecar.CPUMilli != 30 {
		t.Errorf("sidecar = %+v", sidecar)
	}
}

func TestPodSampleWithNoSampleYetIsNotAnError(t *testing.T) {
	h := newReader(t)
	h.failOne("pods", apierrors.NewNotFound(podMetrics.GroupResource(), "api"))

	usage, err := h.reader.PodSample(context.Background(), "test", "default", "api")
	if err != nil {
		t.Fatalf("a pod metrics-server has not sampled yet must not fail the call: %v", err)
	}
	// The chart shows the reason; whether metrics-server exists at all is what the
	// cluster-wide sample answers, so this NotFound is about the pod.
	if usage.Available || usage.Error == "" || usage.Containers == nil {
		t.Fatalf("usage = %+v", usage)
	}
}

func TestUnreadableQuantitiesCountAsZero(t *testing.T) {
	h := newReader(t)
	h.serve("nodes", nodeSample("node-1", "not-a-quantity", ""))

	sample, err := h.reader.Sample(context.Background(), "test")
	if err != nil {
		t.Fatalf("Sample: %v", err)
	}
	if node := find(t, sample.Nodes, "node-1"); node.CPUMilli != 0 || node.MemoryBytes != 0 {
		t.Fatalf("expected zeroes rather than a failure: %+v", node)
	}
}

func TestSampleIsUnavailableWhenMetricsAreNotServed(t *testing.T) {
	h := newReader(t)
	h.fail("nodes", apierrors.NewNotFound(nodeMetrics.GroupResource(), ""))

	sample, err := h.reader.Sample(context.Background(), "test")
	if err != nil {
		t.Fatalf("a missing metrics-server must not fail the call: %v", err)
	}
	if sample.Available || sample.Error == "" {
		t.Fatalf("expected an unavailable sample carrying a reason, got %+v", sample)
	}
	if sample.Nodes == nil || sample.Pods == nil {
		t.Fatalf("an unavailable sample still carries empty lists, got %+v", sample)
	}
}

func TestSampleIsUnavailableWhenPodMetricsFail(t *testing.T) {
	h := newReader(t)
	h.serve("nodes", nodeSample("node-1", "1", "1Gi"))
	h.fail("pods", apierrors.NewServiceUnavailable("metrics-server is starting"))

	sample, err := h.reader.Sample(context.Background(), "test")
	if err != nil {
		t.Fatalf("Sample: %v", err)
	}
	// Half a sample is worse than none: the views would show usage for the nodes
	// and "—" for every pod on them, which reads as idle pods rather than no data.
	if sample.Available || len(sample.Nodes) != 0 {
		t.Fatalf("expected the whole sample to be unavailable, got %+v", sample)
	}
}

func TestSampleFailsForAClusterThatIsNotConnected(t *testing.T) {
	h := newReader(t)

	if _, err := h.reader.Sample(context.Background(), "other"); err == nil {
		t.Fatal("expected an error for an unknown cluster")
	}
}
