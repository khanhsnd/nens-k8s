package exec

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"sync"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

type Clusters interface {
	Connection(id string) (*cluster.Connection, bool)
}

// dialer is the seam the tests replace: building the executor is the only step
// that needs a real API server behind it.
type dialer func(conn *cluster.Connection, target domain.ContainerTarget, opts domain.ExecOptions) (remotecommand.Executor, error)

type Runner struct {
	clusters Clusters
	bus      domain.Publisher
	dial     dialer

	mu       sync.Mutex
	sessions map[string]*session
}

// session is one attached terminal: a pipe carrying keystrokes, a queue carrying
// resizes, and whatever has to be torn down when the stream ends.
type session struct {
	cancel  context.CancelFunc
	input   *io.PipeWriter
	sizes   *sizeQueue
	cleanup func()
}

func NewRunner(clusters Clusters, bus domain.Publisher) *Runner {
	return &Runner{
		clusters: clusters,
		bus:      bus,
		dial:     spdy,
		sessions: make(map[string]*session),
	}
}

func (r *Runner) Start(token string, clusterID string, target domain.ContainerTarget, opts domain.ExecOptions) error {
	conn, ok := r.clusters.Connection(clusterID)
	if !ok {
		return fmt.Errorf("cluster %q is not connected", clusterID)
	}
	return r.start(token, conn, target, opts, nil)
}

func (r *Runner) Send(token string, data string) error {
	current, ok := r.session(token)
	if !ok {
		return fmt.Errorf("exec session %q is not running", token)
	}

	_, err := current.input.Write([]byte(data))
	return err
}

func (r *Runner) Resize(token string, cols uint16, rows uint16) error {
	current, ok := r.session(token)
	if !ok {
		return fmt.Errorf("exec session %q is not running", token)
	}

	current.sizes.push(cols, rows)
	return nil
}

func (r *Runner) Stop(token string) error {
	r.close(token)
	return nil
}

func (r *Runner) start(
	token string,
	conn *cluster.Connection,
	target domain.ContainerTarget,
	opts domain.ExecOptions,
	cleanup func(),
) error {
	if token == "" {
		return errors.New("exec token is required")
	}

	stream, err := r.dial(conn, target, opts)
	if err != nil {
		return err
	}

	r.mu.Lock()
	if _, running := r.sessions[token]; running {
		r.mu.Unlock()
		return fmt.Errorf("exec session %q already exists", token)
	}

	ctx, cancel := context.WithCancel(conn.Context())
	keys, input := io.Pipe()
	current := &session{
		cancel:  cancel,
		input:   input,
		sizes:   newSizeQueue(opts.Cols, opts.Rows),
		cleanup: cleanup,
	}
	r.sessions[token] = current
	r.mu.Unlock()

	slog.Info("exec session started",
		"token", token, "namespace", target.Namespace,
		"pod", target.Pod, "container", target.Container, "command", command(opts))

	go r.run(ctx, token, stream, current, keys, opts)
	return nil
}

func (r *Runner) run(
	ctx context.Context,
	token string,
	stream remotecommand.Executor,
	current *session,
	keys io.Reader,
	opts domain.ExecOptions,
) {
	out := newSink(r.bus, token)

	err := stream.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:             keys,
		Stdout:            out,
		Stderr:            errorsOf(out, opts.TTY),
		Tty:               opts.TTY,
		TerminalSizeQueue: current.sizes,
	})
	if ctx.Err() != nil {
		err = nil
	}
	if err != nil {
		slog.Warn("exec session failed", "token", token, "error", err)
	} else {
		slog.Debug("exec session ended", "token", token)
	}

	r.close(token)
	out.close(err)
}

func (r *Runner) session(token string) (*session, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	current, ok := r.sessions[token]
	return current, ok
}

func (r *Runner) close(token string) {
	r.mu.Lock()
	current, ok := r.sessions[token]
	delete(r.sessions, token)
	r.mu.Unlock()

	if !ok {
		return
	}

	current.input.Close()
	current.sizes.close()
	current.cancel()
	if current.cleanup != nil {
		current.cleanup()
	}
}

// A TTY multiplexes stderr into stdout, and the API server rejects a request
// that asks for both.
func errorsOf(out *sink, tty bool) io.Writer {
	if tty {
		return nil
	}
	return out
}

func spdy(conn *cluster.Connection, target domain.ContainerTarget, opts domain.ExecOptions) (remotecommand.Executor, error) {
	return remotecommand.NewSPDYExecutor(conn.RESTConfig(), http.MethodPost, execURL(conn, target, opts))
}

func execURL(conn *cluster.Connection, target domain.ContainerTarget, opts domain.ExecOptions) *url.URL {
	return conn.Clientset().CoreV1().RESTClient().Post().
		Resource("pods").
		Namespace(target.Namespace).
		Name(target.Pod).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: target.Container,
			Command:   command(opts),
			Stdin:     true,
			Stdout:    true,
			Stderr:    !opts.TTY,
			TTY:       opts.TTY,
		}, scheme.ParameterCodec).
		URL()
}

func command(opts domain.ExecOptions) []string {
	if len(opts.Command) > 0 {
		return opts.Command
	}
	return []string{"sh"}
}
