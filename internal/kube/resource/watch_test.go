package resource

import (
	"context"
	"errors"
	"log/slog"
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

	w := newWatch(bus, informer, cancel, slog.Default())
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

func revised(name string, version string) *unstructured.Unstructured {
	object := pod(name)
	object.SetResourceVersion(version)
	return object
}

func TestRepeatedDeltasForOneObjectCollapseToTheLatest(t *testing.T) {
	bus, w, _ := startWatch(t)

	w.addToken("token-1")
	w.enqueue(domain.EventAdded, revised("alpha", "1"))
	w.enqueue(domain.EventModified, revised("alpha", "2"))
	w.enqueue(domain.EventModified, revised("alpha", "3"))

	batch := bus.next(t)
	if len(batch.Events) != 1 {
		t.Fatalf("events = %+v, want one per object", batch.Events)
	}
	if batch.Events[0].Type != domain.EventModified {
		t.Errorf("type = %q, want the last one to win", batch.Events[0].Type)
	}

	metadata := batch.Events[0].Object["metadata"].(map[string]any)
	if metadata["resourceVersion"] != "3" {
		t.Errorf("resourceVersion = %v, want the newest object", metadata["resourceVersion"])
	}
}

func TestTheWindowReopensAfterAFlush(t *testing.T) {
	bus, w, _ := startWatch(t)

	w.addToken("token-1")
	w.enqueue(domain.EventAdded, pod("alpha"))
	if first := bus.next(t); len(first.Events) != 1 {
		t.Fatalf("first batch = %+v", first.Events)
	}

	w.enqueue(domain.EventAdded, pod("beta"))
	if second := bus.next(t); len(second.Events) != 1 {
		t.Fatalf("second batch = %+v", second.Events)
	}
}

func TestEverySubscriberGetsItsOwnBatch(t *testing.T) {
	bus, w, _ := startWatch(t)

	w.addToken("token-1")
	w.addToken("token-2")
	w.enqueue(domain.EventAdded, pod("alpha"))

	events := map[string]int{}
	for range 2 {
		batch := bus.next(t)
		events[batch.Token] = len(batch.Events)
	}
	if events["token-1"] != 1 || events["token-2"] != 1 {
		t.Errorf("batches = %+v, want one carrying the pod for each token", events)
	}
}

func TestSyncIsAnnouncedWithoutReplayingTheCache(t *testing.T) {
	bus, w, _ := startWatch(t, pod("alpha"))

	w.addToken("token-1")
	w.markSynced()

	batch := bus.next(t)
	if !batch.Synced || batch.Reset || len(batch.Events) != 0 {
		t.Fatalf("sync batch = %+v, want the flag alone", batch)
	}

	w.addToken("token-2")
	w.publishSnapshot("token-2")

	snapshot := bus.next(t)
	if !snapshot.Synced || !snapshot.Reset || len(snapshot.Events) != 1 {
		t.Errorf("snapshot = %+v, want a synced reset carrying the pod", snapshot)
	}
}

func TestWatchErrorsReachEverySubscriber(t *testing.T) {
	bus, w, _ := startWatch(t)

	w.addToken("token-1")
	w.addToken("token-2")
	w.publishError(errors.New("connection refused"))

	for range 2 {
		batch := bus.next(t)
		if batch.Error == "" || len(batch.Events) != 0 {
			t.Errorf("batch = %+v, want the error and no events", batch)
		}
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
