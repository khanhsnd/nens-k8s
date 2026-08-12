package logs

import (
	"context"
	"maps"
	"testing"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

var deploymentGVR = schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}

type recorder struct {
	chunks chan domain.LogChunk
}

func (r *recorder) Publish(_ string, payload any) {
	r.chunks <- payload.(domain.LogChunk)
}

func (r *recorder) next(t *testing.T) domain.LogChunk {
	t.Helper()

	select {
	case chunk := <-r.chunks:
		return chunk
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for a log chunk")
		return domain.LogChunk{}
	}
}

type clusters struct {
	conn *cluster.Connection
}

func (c clusters) Connection(id string) (*cluster.Connection, bool) {
	return c.conn, id == "test"
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

func podObject(name string) *unstructured.Unstructured {
	return object("v1", "Pod", name, map[string]any{
		"spec": map[string]any{
			"initContainers": []any{map[string]any{"name": "wait-for-db"}},
			"containers":     []any{map[string]any{"name": "api"}, map[string]any{"name": "sidecar"}},
		},
		"status": map[string]any{
			"containerStatuses": []any{
				map[string]any{
					"name":         "api",
					"restartCount": int64(3),
					"state":        map[string]any{"running": map[string]any{}},
				},
			},
			"initContainerStatuses": []any{
				map[string]any{
					"name":  "wait-for-db",
					"state": map[string]any{"terminated": map[string]any{"exitCode": int64(0)}},
				},
			},
		},
	})
}

func newStreamer(t *testing.T, objects ...runtime.Object) (*Streamer, *recorder, *fake.Clientset) {
	t.Helper()

	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			podsGVR:       "PodList",
			deploymentGVR: "DeploymentList",
		},
		objects...,
	)
	clientset := fake.NewClientset()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{
		Dynamic:   dyn,
		Clientset: clientset,
	})
	bus := &recorder{chunks: make(chan domain.LogChunk, 32)}
	return NewStreamer(clusters{conn: conn}, bus), bus, clientset
}

func ref(resource string, name string) domain.ResourceRef {
	gvr := domain.GVR{Version: "v1", Resource: resource}
	if resource == "deployments" {
		gvr = domain.GVR{Group: "apps", Version: "v1", Resource: resource}
	}
	return domain.ResourceRef{ClusterID: "test", GVR: gvr, Namespace: "default", Name: name}
}

func TestStartStreamsLinesAndFinishes(t *testing.T) {
	streamer, bus, _ := newStreamer(t)

	target := domain.LogTarget{Namespace: "default", Pod: "api-1", Container: "api"}
	if err := streamer.Start("token-1", "test", target, domain.LogOptions{TailLines: 100}); err != nil {
		t.Fatal(err)
	}

	chunk := bus.next(t)
	if chunk.Token != "token-1" || len(chunk.Lines) != 1 || chunk.Lines[0] != "fake logs" {
		t.Fatalf("unexpected chunk: %+v", chunk)
	}
	if !chunk.Done {
		t.Error("the last chunk of a finished stream should be marked done")
	}
}

func TestStartRejectsADuplicateToken(t *testing.T) {
	streamer, _, _ := newStreamer(t)

	target := domain.LogTarget{Namespace: "default", Pod: "api-1", Container: "api"}
	streamer.streams["token-1"] = func() {}

	if err := streamer.Start("token-1", "test", target, domain.LogOptions{}); err == nil {
		t.Error("starting a stream twice under one token should fail")
	}
}

func TestStartSendsThePodLogOptions(t *testing.T) {
	streamer, bus, clientset := newStreamer(t)

	target := domain.LogTarget{Namespace: "default", Pod: "api-1", Container: "sidecar"}
	opts := domain.LogOptions{Follow: true, TailLines: 500, SinceSeconds: 900, Timestamps: true}
	if err := streamer.Start("token-1", "test", target, opts); err != nil {
		t.Fatal(err)
	}
	bus.next(t)

	var sent *corev1.PodLogOptions
	for _, action := range clientset.Actions() {
		if get, ok := action.(k8stesting.GenericAction); ok && action.GetSubresource() == "log" {
			sent, _ = get.GetValue().(*corev1.PodLogOptions)
		}
	}
	if sent == nil {
		t.Fatal("no log request was recorded")
	}

	if sent.Container != "sidecar" || !sent.Follow || !sent.Timestamps {
		t.Errorf("unexpected options: %+v", sent)
	}
	if sent.TailLines == nil || *sent.TailLines != 500 {
		t.Errorf("tailLines = %v, want 500", sent.TailLines)
	}
	if sent.SinceSeconds == nil || *sent.SinceSeconds != 900 {
		t.Errorf("sinceSeconds = %v, want 900", sent.SinceSeconds)
	}
}

func TestStartRefusesADisconnectedCluster(t *testing.T) {
	streamer, _, _ := newStreamer(t)

	target := domain.LogTarget{Namespace: "default", Pod: "api-1", Container: "api"}
	if err := streamer.Start("token-1", "other", target, domain.LogOptions{}); err == nil {
		t.Error("streaming from a cluster that is not connected should fail")
	}
}

func TestTargetsListsEveryContainerOfAPod(t *testing.T) {
	streamer, _, _ := newStreamer(t, podObject("api-1"))

	targets, err := streamer.Targets(context.Background(), ref("pods", "api-1"))
	if err != nil {
		t.Fatal(err)
	}

	want := []domain.LogTarget{
		{Namespace: "default", Pod: "api-1", Container: "wait-for-db", Role: domain.ContainerRoleInit, State: "terminated"},
		{Namespace: "default", Pod: "api-1", Container: "api", Role: domain.ContainerRoleApp, State: "running", Restarts: 3},
		{Namespace: "default", Pod: "api-1", Container: "sidecar", Role: domain.ContainerRoleApp},
	}
	if len(targets) != len(want) {
		t.Fatalf("got %d targets, want %d: %+v", len(targets), len(want), targets)
	}
	for i, target := range targets {
		if target != want[i] {
			t.Errorf("target %d = %+v, want %+v", i, target, want[i])
		}
	}
}

func TestTargetsResolvesAWorkloadThroughItsSelector(t *testing.T) {
	deployment := object("apps/v1", "Deployment", "api", map[string]any{
		"spec": map[string]any{
			"selector": map[string]any{"matchLabels": map[string]any{"app": "api"}},
		},
	})
	streamer, _, _ := newStreamer(t, deployment, podObject("api-1"), podObject("api-2"))

	targets, err := streamer.Targets(context.Background(), ref("deployments", "api"))
	if err != nil {
		t.Fatal(err)
	}

	if len(targets) != 6 {
		t.Fatalf("got %d targets, want 6 (2 pods × 3 containers): %+v", len(targets), targets)
	}
}

func TestTargetsFailsWhenNothingSelectsPods(t *testing.T) {
	configmap := object("v1", "ConfigMap", "settings", nil)
	streamer, _, _ := newStreamer(t, configmap)

	cmRef := domain.ResourceRef{
		ClusterID: "test",
		GVR:       domain.GVR{Version: "v1", Resource: "configmaps"},
		Namespace: "default",
		Name:      "settings",
	}
	if _, err := streamer.Targets(context.Background(), cmRef); err == nil {
		t.Error("a kind with no pod selector should report an error")
	}
}
