package forward

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
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

type dialer func(
	conn *cluster.Connection,
	namespace string,
	pod string,
	ports []string,
	stop <-chan struct{},
	ready chan struct{},
) (tunnel, error)

type Registry struct {
	clusters Clusters
	bus      domain.Publisher
	dial     dialer

	mu       sync.Mutex
	seq      int
	forwards map[string]*forward
}

type forward struct {
	meta domain.PortForward
	stop chan struct{}
	once sync.Once
}

func NewRegistry(clusters Clusters, bus domain.Publisher) *Registry {
	return &Registry{
		clusters: clusters,
		bus:      bus,
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

	entry := &forward{
		stop: make(chan struct{}),
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
	pipe, err := r.dial(conn, ref.Namespace, pod, ports, entry.stop, ready)
	if err != nil {
		return domain.PortForward{}, err
	}

	r.mu.Lock()
	r.seq++
	entry.meta.ID = fmt.Sprintf("forward-%d", r.seq)
	r.forwards[entry.meta.ID] = entry
	meta := entry.meta
	r.mu.Unlock()

	go r.serve(meta.ID, entry, pipe)
	go r.activate(meta.ID, entry, pipe, ready)
	go r.untilDisconnected(meta.ID, entry.stop, conn.Context())

	return meta, nil
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

func (r *Registry) Stop(id string) error {
	r.mu.Lock()
	entry := r.forwards[id]
	r.mu.Unlock()

	if entry == nil {
		return nil
	}
	r.finish(id, entry, nil)
	return nil
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
	if err != nil || len(ports) == 0 {
		return
	}

	r.mu.Lock()
	if _, live := r.forwards[id]; !live {
		r.mu.Unlock()
		return
	}
	entry.meta.LocalPort = int(ports[0].Local)
	entry.meta.Status = domain.ForwardActive
	meta := entry.meta
	r.mu.Unlock()

	r.bus.Publish(event.TopicForwardChanged, meta)
}

func (r *Registry) untilDisconnected(id string, stop <-chan struct{}, connection context.Context) {
	select {
	case <-connection.Done():
		_ = r.Stop(id)
	case <-stop:
	}
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
	return portforward.New(dialer, ports, stop, ready, io.Discard, io.Discard)
}
