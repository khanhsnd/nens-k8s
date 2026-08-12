package resource

import (
	"context"
	"sync"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/event"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/tools/cache"
)

const (
	flushInterval = 100 * time.Millisecond
	lastApplied   = "kubectl.kubernetes.io/last-applied-configuration"
)

type delta struct {
	kind   domain.EventType
	object *unstructured.Unstructured
}

type watch struct {
	bus      domain.Publisher
	informer cache.SharedIndexInformer
	cancel   context.CancelFunc

	mu      sync.Mutex
	tokens  map[string]bool
	pending map[string]delta
	timer   *time.Timer
	synced  bool
}

func newWatch(bus domain.Publisher, informer cache.SharedIndexInformer, cancel context.CancelFunc) *watch {
	w := &watch{
		bus:      bus,
		informer: informer,
		cancel:   cancel,
		tokens:   make(map[string]bool),
		pending:  make(map[string]delta),
	}

	_, _ = informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(obj any) { w.enqueue(domain.EventAdded, obj) },
		UpdateFunc: func(_, obj any) { w.enqueue(domain.EventModified, obj) },
		DeleteFunc: func(obj any) { w.enqueue(domain.EventDeleted, obj) },
	})
	_ = informer.SetWatchErrorHandler(func(_ *cache.Reflector, err error) { w.publishError(err) })

	return w
}

func (w *watch) addToken(token string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.tokens[token] = true
}

func (w *watch) removeToken(token string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()

	delete(w.tokens, token)
	return len(w.tokens) == 0
}

func (w *watch) stop() {
	w.mu.Lock()
	if w.timer != nil {
		w.timer.Stop()
		w.timer = nil
	}
	w.mu.Unlock()

	w.cancel()
}

func (w *watch) publishSnapshot(token string) {
	w.mu.Lock()
	defer w.mu.Unlock()

	items := w.informer.GetStore().List()
	events := make([]domain.ResourceEvent, 0, len(items))
	for _, item := range items {
		if object := asUnstructured(item); object != nil {
			events = append(events, resourceEvent(domain.EventAdded, object))
		}
	}

	w.bus.Publish(event.TopicResourceEvent, domain.ResourceBatch{
		Token:  token,
		Reset:  true,
		Synced: w.synced,
		Events: events,
	})
}

func (w *watch) markSynced() {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.synced = true
	w.broadcastLocked(domain.ResourceBatch{Synced: true, Events: []domain.ResourceEvent{}})
}

func (w *watch) publishError(err error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.broadcastLocked(domain.ResourceBatch{
		Synced: w.synced,
		Error:  err.Error(),
		Events: []domain.ResourceEvent{},
	})
}

func (w *watch) enqueue(kind domain.EventType, item any) {
	object := asUnstructured(item)
	if object == nil {
		return
	}

	w.mu.Lock()
	defer w.mu.Unlock()

	if len(w.tokens) == 0 {
		return
	}
	w.pending[string(object.GetUID())] = delta{kind: kind, object: object}
	if w.timer == nil {
		w.timer = time.AfterFunc(flushInterval, w.flush)
	}
}

func (w *watch) flush() {
	w.mu.Lock()
	defer w.mu.Unlock()

	w.timer = nil
	if len(w.pending) == 0 {
		return
	}

	events := make([]domain.ResourceEvent, 0, len(w.pending))
	for _, item := range w.pending {
		events = append(events, resourceEvent(item.kind, item.object))
	}
	clear(w.pending)

	w.broadcastLocked(domain.ResourceBatch{Synced: w.synced, Events: events})
}

func (w *watch) broadcastLocked(batch domain.ResourceBatch) {
	for token := range w.tokens {
		batch.Token = token
		w.bus.Publish(event.TopicResourceEvent, batch)
	}
}

func resourceEvent(kind domain.EventType, object *unstructured.Unstructured) domain.ResourceEvent {
	item := domain.ResourceEvent{Type: kind, UID: string(object.GetUID())}
	if kind != domain.EventDeleted {
		item.Object = trim(object)
	}
	return item
}

func trim(object *unstructured.Unstructured) map[string]any {
	out := object.DeepCopy()
	out.SetManagedFields(nil)

	if annotations := out.GetAnnotations(); annotations[lastApplied] != "" {
		delete(annotations, lastApplied)
		if len(annotations) == 0 {
			annotations = nil
		}
		out.SetAnnotations(annotations)
	}
	return out.Object
}

func asUnstructured(item any) *unstructured.Unstructured {
	switch value := item.(type) {
	case *unstructured.Unstructured:
		return value
	case cache.DeletedFinalStateUnknown:
		return asUnstructured(value.Obj)
	}
	return nil
}
