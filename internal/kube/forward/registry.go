package forward

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"sort"
	"strings"
	"sync"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/event"
	"nens-k8s/internal/kube/cluster"
	"nens-k8s/internal/kube/pods"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

type Clusters interface {
	Connection(id string) (*cluster.Connection, bool)
}

// tunnel is client-go's PortForwarder, narrowed to what the registry drives so
// the state machine can be tested without an API server.
type tunnel interface {
	ForwardPorts() error
	GetPorts() ([]portforward.ForwardedPort, error)
}

// notes is the stream client-go writes its per-connection errors to — a
// "connection refused" when nothing listens on the remote port. The tunnel
// survives those, so the message lands on the row instead of ending it.
type notes func(message string)

func (n notes) Write(p []byte) (int, error) {
	if message := strings.TrimSpace(string(p)); message != "" {
		n(message)
	}
	return len(p), nil
}

type dialer func(
	conn *cluster.Connection,
	namespace string,
	pod string,
	ports []string,
	stop <-chan struct{},
	ready chan struct{},
	notes io.Writer,
) (tunnel, error)

type Registry struct {
	clusters Clusters
	bus      domain.Publisher
	store    domain.ForwardStore
	dial     dialer

	mu       sync.Mutex
	seq      int
	forwards map[string]*forward
}

type forward struct {
	meta domain.PortForward
	spec domain.ForwardSpec
	stop chan struct{}
	once sync.Once
}

func NewRegistry(clusters Clusters, bus domain.Publisher, store domain.ForwardStore) *Registry {
	return &Registry{
		clusters: clusters,
		bus:      bus,
		store:    store,
		dial:     dialSPDY,
		forwards: make(map[string]*forward),
	}
}

func (r *Registry) Start(
	ctx context.Context,
	ref domain.ResourceRef,
	localPort int,
	remotePort int,
) (domain.PortForward, error) {
	conn, ok := r.clusters.Connection(ref.ClusterID)
	if !ok {
		return domain.PortForward{}, fmt.Errorf("cluster %q is not connected", ref.ClusterID)
	}
	if remotePort <= 0 {
		return domain.PortForward{}, errors.New("a remote port is required")
	}

	pod, err := runningPod(ctx, conn, ref)
	if err != nil {
		return domain.PortForward{}, err
	}

	spec := domain.ForwardSpec{Ref: ref, LocalPort: localPort, RemotePort: remotePort}
	spec.Ref.UID = "" // a uid does not survive the pod it names, and nothing here reads it

	entry := &forward{
		stop: make(chan struct{}),
		spec: spec,
		meta: domain.PortForward{
			ClusterID:  ref.ClusterID,
			Namespace:  ref.Namespace,
			Resource:   ref.GVR.Resource,
			Name:       ref.Name,
			Pod:        pod,
			LocalPort:  localPort,
			RemotePort: remotePort,
			Status:     domain.ForwardStarting,
		},
	}

	ready := make(chan struct{})
	ports := []string{fmt.Sprintf("%d:%d", localPort, remotePort)}
	pipe, err := r.dial(conn, ref.Namespace, pod, ports, entry.stop, ready, notes(func(message string) {
		r.trouble(entry, message)
	}))
	if err != nil {
		return domain.PortForward{}, err
	}

	r.mu.Lock()
	r.seq++
	entry.meta.ID = fmt.Sprintf("forward-%d", r.seq)
	r.forwards[entry.meta.ID] = entry
	meta := entry.meta
	r.mu.Unlock()

	r.remember(spec)
	slog.Info("forward started",
		"id", meta.ID, "cluster", ref.ClusterID, "namespace", ref.Namespace,
		"pod", pod, "local", localPort, "remote", remotePort)

	go r.serve(meta.ID, entry, pipe)
	go r.activate(meta.ID, entry, pipe, ready)
	go r.untilDisconnected(meta.ID, entry, conn.Context())

	return meta, nil
}

// Restore starts every forward remembered for a cluster that is not already up.
// It runs when a cluster connects, so a forward survives a restart of Nens.
func (r *Registry) Restore(ctx context.Context, clusterID string) ([]domain.PortForward, error) {
	restored := make([]domain.PortForward, 0)

	for _, spec := range r.store.Forwards() {
		if spec.Ref.ClusterID != clusterID || r.live(spec) {
			continue
		}

		meta, err := r.Start(ctx, spec.Ref, spec.LocalPort, spec.RemotePort)
		if err != nil {
			meta = r.unrestored(spec, err)
		}
		restored = append(restored, meta)
	}
	return restored, nil
}

// unrestored is a forward that could not come back. Restore runs on a connect
// with nobody waiting on its return value, so the failure has to be a record the
// view can show rather than an error the caller reads.
//
// It stays in the registry with no tunnel behind it, which is what makes Stop
// able to forget its spec — otherwise a forward that fails every connect could
// only be dropped by editing the settings file. The next connect updates that
// same record instead of stacking a second one.
func (r *Registry) unrestored(spec domain.ForwardSpec, err error) domain.PortForward {
	slog.Warn("forward not restored",
		"cluster", spec.Ref.ClusterID, "namespace", spec.Ref.Namespace,
		"name", spec.Ref.Name, "remote", spec.RemotePort, "error", err)

	r.mu.Lock()
	defer r.mu.Unlock()

	entry := r.failure(spec)
	if entry == nil {
		r.seq++
		entry = &forward{
			stop: make(chan struct{}),
			spec: spec,
			meta: domain.PortForward{
				ID:         fmt.Sprintf("forward-%d", r.seq),
				ClusterID:  spec.Ref.ClusterID,
				Namespace:  spec.Ref.Namespace,
				Resource:   spec.Ref.GVR.Resource,
				Name:       spec.Ref.Name,
				LocalPort:  spec.LocalPort,
				RemotePort: spec.RemotePort,
				Status:     domain.ForwardError,
			},
		}
		r.forwards[entry.meta.ID] = entry
	}

	entry.meta.Error = err.Error()
	return entry.meta
}

// failure finds the record left by an earlier failed restore of the same tunnel.
func (r *Registry) failure(spec domain.ForwardSpec) *forward {
	for _, entry := range r.forwards {
		if entry.meta.Status == domain.ForwardError && entry.spec.SameTunnel(spec) {
			return entry
		}
	}
	return nil
}

func (r *Registry) List() []domain.PortForward {
	r.mu.Lock()
	defer r.mu.Unlock()

	out := make([]domain.PortForward, 0, len(r.forwards))
	for _, entry := range r.forwards {
		out = append(out, entry.meta)
	}
	sort.Slice(out, func(a int, b int) bool { return out[a].ID < out[b].ID })
	return out
}

// Stop is the only path that forgets a forward: one that dies with its cluster or
// with the app is meant to come back on the next connect.
func (r *Registry) Stop(id string) error {
	r.mu.Lock()
	entry := r.forwards[id]
	r.mu.Unlock()

	if entry == nil {
		return nil
	}
	r.forget(entry.spec)
	r.finish(id, entry, nil)
	return nil
}

// live ignores the records left by a failed restore: those are there to be seen
// and stopped, not to stand in for a tunnel that never opened.
func (r *Registry) live(spec domain.ForwardSpec) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, entry := range r.forwards {
		if entry.meta.Status != domain.ForwardError && entry.spec.SameTunnel(spec) {
			return true
		}
	}
	return false
}

func (r *Registry) remember(spec domain.ForwardSpec) {
	kept := slices.DeleteFunc(r.store.Forwards(), spec.SameTunnel)
	if err := r.store.SetForwards(append(kept, spec)); err != nil {
		slog.Warn("forward not remembered", "name", spec.Ref.Name, "error", err)
	}
}

func (r *Registry) forget(spec domain.ForwardSpec) {
	if err := r.store.SetForwards(slices.DeleteFunc(r.store.Forwards(), spec.SameTunnel)); err != nil {
		slog.Warn("forward not forgotten", "name", spec.Ref.Name, "error", err)
	}
}

func (r *Registry) serve(id string, entry *forward, pipe tunnel) {
	r.finish(id, entry, pipe.ForwardPorts())
}

// activate reports the local port the kernel actually gave us, which is the whole
// point of asking for port 0.
func (r *Registry) activate(id string, entry *forward, pipe tunnel, ready chan struct{}) {
	select {
	case <-ready:
	case <-entry.stop:
		return
	}

	ports, err := pipe.GetPorts()
	if err == nil && len(ports) == 0 {
		err = errors.New("the tunnel reported no local port")
	}
	if err != nil {
		r.finish(id, entry, err)
		return
	}

	r.mu.Lock()
	if _, live := r.forwards[id]; !live {
		r.mu.Unlock()
		return
	}
	entry.meta.LocalPort = int(ports[0].Local)
	entry.meta.Status = domain.ForwardActive
	entry.spec.LocalPort = entry.meta.LocalPort
	meta, spec := entry.meta, entry.spec
	r.mu.Unlock()

	// Remember the port the kernel picked, not the 0 that was asked for, so a
	// restored forward answers on the address the user copied.
	r.remember(spec)
	r.bus.Publish(event.TopicForwardChanged, meta)
}

func (r *Registry) untilDisconnected(id string, entry *forward, connection context.Context) {
	select {
	case <-connection.Done():
		r.finish(id, entry, nil)
	case <-entry.stop:
	}
}

// trouble attaches the newest connection error to a forward that is still up,
// so the view can show what a `curl` against it would have said.
func (r *Registry) trouble(entry *forward, message string) {
	r.mu.Lock()
	if _, live := r.forwards[entry.meta.ID]; !live || entry.meta.Error == message {
		r.mu.Unlock()
		return
	}
	entry.meta.Error = message
	meta := entry.meta
	r.mu.Unlock()

	slog.Warn("forward connection failed", "id", meta.ID, "error", message)
	r.bus.Publish(event.TopicForwardChanged, meta)
}

// finish is the only teardown path: whoever gets there first reports the final
// state, the other caller finds the entry gone and stays quiet.
func (r *Registry) finish(id string, entry *forward, err error) {
	r.mu.Lock()
	_, live := r.forwards[id]
	delete(r.forwards, id)
	if live {
		entry.meta.Status = domain.ForwardStopped
		if err != nil {
			entry.meta.Status = domain.ForwardError
			entry.meta.Error = err.Error()
		}
	}
	meta := entry.meta
	r.mu.Unlock()

	if !live {
		return
	}

	if err != nil {
		slog.Warn("forward failed", "id", id, "error", err)
	} else {
		slog.Info("forward stopped", "id", id)
	}

	entry.once.Do(func() { close(entry.stop) })
	r.bus.Publish(event.TopicForwardChanged, meta)
}

func runningPod(ctx context.Context, conn *cluster.Connection, ref domain.ResourceRef) (string, error) {
	found, err := pods.Selected(ctx, conn, ref)
	if err != nil {
		return "", err
	}

	for i := range found {
		phase, _, _ := unstructured.NestedString(found[i].Object, "status", "phase")
		if phase == string(corev1.PodRunning) {
			return found[i].GetName(), nil
		}
	}
	return "", fmt.Errorf("%s %q has no running pod", ref.GVR.Resource, ref.Name)
}

func dialSPDY(
	conn *cluster.Connection,
	namespace string,
	pod string,
	ports []string,
	stop <-chan struct{},
	ready chan struct{},
	stream io.Writer,
) (tunnel, error) {
	transport, upgrader, err := spdy.RoundTripperFor(conn.RESTConfig())
	if err != nil {
		return nil, err
	}

	endpoint := conn.Clientset().CoreV1().RESTClient().Post().
		Resource("pods").
		Namespace(namespace).
		Name(pod).
		SubResource("portforward").
		URL()

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, http.MethodPost, endpoint)
	return portforward.New(dialer, ports, stop, ready, io.Discard, stream)
}
