package resource

import (
	"context"
	"testing"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

var pods = domain.GVR{Version: "v1", Resource: "pods"}

type connected struct {
	conn *cluster.Connection
}

func (c connected) Connection(id string) (*cluster.Connection, bool) {
	return c.conn, id == "test"
}

func newStore(t *testing.T, objects ...runtime.Object) (*Store, *recorder, context.CancelFunc) {
	t.Helper()

	client := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{podGVR: "PodList"},
		objects...,
	)

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{Dynamic: client})
	bus := &recorder{batches: make(chan domain.ResourceBatch, 64)}
	return NewStore(connected{conn: conn}, bus), bus, cancel
}

func counts(s *Store) (int, int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return len(s.watches), len(s.tokens)
}

func watchFor(s *Store, namespace string) *watch {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.watches[target{cluster: "test", gvr: pods, namespace: namespace}]
}

func eventually(t *testing.T, want string, done func() bool) {
	t.Helper()

	for deadline := time.Now().Add(2 * time.Second); time.Now().Before(deadline); {
		if done() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", want)
}

// A subscriber meets an object either in its snapshot or in the deltas that
// follow, depending on whether the informer had listed by the time it arrived.
func awaitObject(t *testing.T, bus *recorder, tokens []string, uid string) {
	t.Helper()

	seen := make(map[string]bool, len(tokens))
	for len(seen) < len(tokens) {
		batch := bus.next(t)
		for _, item := range batch.Events {
			if item.UID == uid {
				seen[batch.Token] = true
			}
		}
	}
}

func TestOneInformerServesEverySubscriberOfATarget(t *testing.T) {
	store, bus, _ := newStore(t, pod("alpha"))

	subscribers := []string{"token-1", "token-2"}
	for _, token := range subscribers {
		if _, err := store.Subscribe(token, "test", pods, "default"); err != nil {
			t.Fatal(err)
		}
	}
	awaitObject(t, bus, subscribers, "uid-alpha")

	if watches, tokens := counts(store); watches != 1 || tokens != 2 {
		t.Errorf("watches = %d, tokens = %d; want one informer serving two tokens", watches, tokens)
	}
}

func TestTheInformerStopsWhenTheLastTokenLeaves(t *testing.T) {
	store, _, _ := newStore(t, pod("alpha"))

	for _, token := range []string{"token-1", "token-2"} {
		if _, err := store.Subscribe(token, "test", pods, "default"); err != nil {
			t.Fatal(err)
		}
	}
	first := watchFor(store, "default")

	if err := store.Unsubscribe("token-1"); err != nil {
		t.Fatal(err)
	}
	if watches, _ := counts(store); watches != 1 {
		t.Fatalf("watches = %d after one token left, want the informer kept", watches)
	}

	if err := store.Unsubscribe("token-2"); err != nil {
		t.Fatal(err)
	}
	if watches, tokens := counts(store); watches != 0 || tokens != 0 {
		t.Fatalf("watches = %d, tokens = %d after the last token left; want both empty", watches, tokens)
	}

	if _, err := store.Subscribe("token-3", "test", pods, "default"); err != nil {
		t.Fatal(err)
	}
	if watchFor(store, "default") == first {
		t.Error("subscribing again should start a new informer, not revive the stopped one")
	}
}

func TestEachNamespaceIsItsOwnInformer(t *testing.T) {
	store, _, _ := newStore(t, pod("alpha"))

	for namespace, token := range map[string]string{"default": "token-1", "kube-system": "token-2", "": "token-3"} {
		if _, err := store.Subscribe(token, "test", pods, namespace); err != nil {
			t.Fatal(err)
		}
	}

	if watches, tokens := counts(store); watches != 3 || tokens != 3 {
		t.Errorf("watches = %d, tokens = %d; want one informer per namespace", watches, tokens)
	}
}

func TestSubscribeRejectsWhatItCannotServe(t *testing.T) {
	store, _, _ := newStore(t)
	if _, err := store.Subscribe("taken", "test", pods, "default"); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name    string
		token   string
		cluster string
	}{
		{name: "no token", token: "", cluster: "test"},
		{name: "token already in use", token: "taken", cluster: "test"},
		{name: "cluster not connected", token: "token-2", cluster: "other"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := store.Subscribe(test.token, test.cluster, pods, "default"); err == nil {
				t.Error("Subscribe should have failed")
			}
		})
	}

	if watches, tokens := counts(store); watches != 1 || tokens != 1 {
		t.Errorf("watches = %d, tokens = %d; a rejected subscribe must leave no trace", watches, tokens)
	}
}

func TestUnsubscribingAnUnknownTokenIsANoOp(t *testing.T) {
	store, _, _ := newStore(t)

	if err := store.Unsubscribe("never-subscribed"); err != nil {
		t.Fatal(err)
	}
}

func TestClosingTheConnectionDropsTheWatchAndItsTokens(t *testing.T) {
	store, _, disconnect := newStore(t, pod("alpha"))

	if _, err := store.Subscribe("token-1", "test", pods, "default"); err != nil {
		t.Fatal(err)
	}
	disconnect()

	eventually(t, "the watch to die with its cluster", func() bool {
		watches, tokens := counts(store)
		return watches == 0 && tokens == 0
	})
}
