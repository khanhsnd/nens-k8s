package logs

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"sync"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/rest"
)

const readBuffer = 64 << 10

type Clusters interface {
	Connection(id string) (*cluster.Connection, bool)
}

type Streamer struct {
	clusters Clusters
	bus      domain.Publisher

	mu      sync.Mutex
	streams map[string]context.CancelFunc
}

func NewStreamer(clusters Clusters, bus domain.Publisher) *Streamer {
	return &Streamer{
		clusters: clusters,
		bus:      bus,
		streams:  make(map[string]context.CancelFunc),
	}
}

func (s *Streamer) Start(token string, clusterID string, target domain.LogTarget, opts domain.LogOptions) error {
	if token == "" {
		return errors.New("stream token is required")
	}
	conn, ok := s.clusters.Connection(clusterID)
	if !ok {
		return fmt.Errorf("cluster %q is not connected", clusterID)
	}

	s.mu.Lock()
	if _, running := s.streams[token]; running {
		s.mu.Unlock()
		return fmt.Errorf("log stream %q already exists", token)
	}
	ctx, cancel := context.WithCancel(conn.Context())
	s.streams[token] = cancel
	s.mu.Unlock()

	request := conn.Clientset().CoreV1().
		Pods(target.Namespace).
		GetLogs(target.Pod, logOptions(target.Container, opts))

	go s.run(ctx, token, request)
	return nil
}

func (s *Streamer) Stop(token string) error {
	s.mu.Lock()
	cancel, ok := s.streams[token]
	delete(s.streams, token)
	s.mu.Unlock()

	if ok {
		cancel()
	}
	return nil
}

func (s *Streamer) run(ctx context.Context, token string, request *rest.Request) {
	out := newSink(s.bus, token)
	err := copyLines(ctx, request, out)

	_ = s.Stop(token)
	out.close(err)
}

func copyLines(ctx context.Context, request *rest.Request, out *sink) error {
	body, err := request.Stream(ctx)
	if err != nil {
		return err
	}
	defer body.Close()

	reader := bufio.NewReaderSize(body, readBuffer)
	for {
		line, err := reader.ReadString('\n')
		if line != "" {
			out.push(line)
		}
		if err != nil {
			if errors.Is(err, io.EOF) || ctx.Err() != nil {
				return nil
			}
			return err
		}
	}
}

func logOptions(container string, opts domain.LogOptions) *corev1.PodLogOptions {
	out := &corev1.PodLogOptions{
		Container:  container,
		Follow:     opts.Follow,
		Timestamps: opts.Timestamps,
		Previous:   opts.Previous,
	}
	if opts.TailLines > 0 {
		out.TailLines = &opts.TailLines
	}
	if opts.SinceSeconds > 0 {
		out.SinceSeconds = &opts.SinceSeconds
	}
	return out
}

func schemaGVR(gvr domain.GVR) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: gvr.Group, Version: gvr.Version, Resource: gvr.Resource}
}
