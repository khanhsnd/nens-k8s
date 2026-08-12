package resource

import (
	"context"
	"testing"
	"time"

	"nens-k8s/internal/domain"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic/dynamicinformer"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/tools/cache"
)

var podGVR = schema.GroupVersionResource{Version: "v1", Resource: "pods"}

type recorder struct {
	batches chan domain.ResourceBatch
}

func (r *recorder) Publish(_ string, payload any) {
	r.batches <- payload.(domain.ResourceBatch)
}

func (r *recorder) next(t *testing.T) domain.ResourceBatch {
	t.Helper()

	select {
	case batch := <-r.batches:
		return batch
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for a resource batch")
		return domain.ResourceBatch{}
	}
}

func pod(name string) *unstructured.Unstructured {
	return &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": "v1",
		"kind":       "Pod",
		"metadata": map[string]any{
			"name":      name,
			"namespace": "default",
			"uid":       "uid-" + name,
			"managedFields": []any{
				map[string]any{"manager": "kubectl", "operation": "Apply"},
			},
		},
	}}
}

func startWatch(t *testing.T, objects ...runtime.Object) (*recorder, *watch, *dynamicfake.FakeDynamicClient) {
	t.Helper()

	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{podGVR: "PodList"},
		objects...,
	)
	informer := dynamicinformer.NewFilteredDynamicInformer(
		client, podGVR, "", 0, cache.Indexers{}, nil,
	).Informer()

	bus := &recorder{batches: make(chan domain.ResourceBatch, 32)}
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	w := newWatch(bus, informer, cancel)
	go informer.Run(ctx.Done())
	if !cache.WaitForCacheSync(ctx.Done(), informer.HasSynced) {
		t.Fatal("informer cache never synced")
	}
	return bus, w, client
}

func TestSnapshotTrimsManagedFields(t *testing.T) {
	bus, w, _ := startWatch(t, pod("alpha"))

	w.addToken("token-1")
	w.publishSnapshot("token-1")

	batch := bus.next(t)
	if !batch.Reset || batch.Token != "token-1" || len(batch.Events) != 1 {
		t.Fatalf("unexpected snapshot: %+v", batch)
	}

	object := batch.Events[0].Object
	metadata := object["metadata"].(map[string]any)
	if _, found := metadata["managedFields"]; found {
		t.Error("managedFields should be trimmed off the payload")
	}
	if batch.Events[0].UID != "uid-alpha" {
		t.Errorf("uid = %q, want uid-alpha", batch.Events[0].UID)
	}
}

func TestDeltasCoalesceIntoOneBatch(t *testing.T) {
	bus, w, client := startWatch(t)

	w.addToken("token-1")
	for _, name := range []string{"alpha", "beta", "gamma"} {
		if _, err := client.Resource(podGVR).Namespace("default").
			Create(context.Background(), pod(name), metav1.CreateOptions{}); err != nil {
			t.Fatal(err)
		}
	}

	batch := bus.next(t)
	if len(batch.Events) != 3 {
		t.Fatalf("expected 3 coalesced events, got %d", len(batch.Events))
	}
	if batch.Reset {
		t.Error("a delta batch must not reset the frontend cache")
	}
}

func TestDeletedEventCarriesNoObject(t *testing.T) {
	bus, w, client := startWatch(t, pod("alpha"))

	w.addToken("token-1")
	if err := client.Resource(podGVR).Namespace("default").
		Delete(context.Background(), "alpha", metav1.DeleteOptions{}); err != nil {
		t.Fatal(err)
	}

	batch := bus.next(t)
	if len(batch.Events) != 1 || batch.Events[0].Type != domain.EventDeleted {
		t.Fatalf("unexpected batch: %+v", batch)
	}
	if batch.Events[0].Object != nil {
		t.Error("deleted events should not carry the object")
	}
}

func TestEventsAreDroppedWithoutSubscribers(t *testing.T) {
	bus, _, client := startWatch(t)

	if _, err := client.Resource(podGVR).Namespace("default").
		Create(context.Background(), pod("alpha"), metav1.CreateOptions{}); err != nil {
		t.Fatal(err)
	}

	select {
	case batch := <-bus.batches:
		t.Fatalf("published %+v with no subscribers", batch)
	case <-time.After(300 * time.Millisecond):
	}
}

func TestRemoveTokenReportsLastSubscriber(t *testing.T) {
	_, w, _ := startWatch(t)

	w.addToken("token-1")
	w.addToken("token-2")

	if w.removeToken("token-1") {
		t.Error("removeToken should report false while a subscriber remains")
	}
	if !w.removeToken("token-2") {
		t.Error("removeToken should report true once the last subscriber leaves")
	}
}
