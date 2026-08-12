package exec

import (
	"bufio"
	"context"
	"encoding/base64"
	"testing"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/rest"
	k8stesting "k8s.io/client-go/testing"
	"k8s.io/client-go/tools/remotecommand"
)

type recorder struct {
	chunks chan domain.ExecChunk
}

func (r *recorder) Publish(_ string, payload any) {
	r.chunks <- payload.(domain.ExecChunk)
}

func (r *recorder) next(t *testing.T) domain.ExecChunk {
	t.Helper()

	select {
	case chunk := <-r.chunks:
		return chunk
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for an exec chunk")
		return domain.ExecChunk{}
	}
}

type clusters struct {
	conn *cluster.Connection
}

func (c clusters) Connection(id string) (*cluster.Connection, bool) {
	return c.conn, id == "test"
}

// stream stands in for the SPDY executor: it hands the stream options back to the
// test and stays attached until the session is cancelled.
type stream struct {
	options chan remotecommand.StreamOptions
	banner  string
}

func (s *stream) Stream(_ remotecommand.StreamOptions) error { return nil }

func (s *stream) StreamWithContext(ctx context.Context, options remotecommand.StreamOptions) error {
	s.options <- options
	if s.banner != "" {
		_, _ = options.Stdout.Write([]byte(s.banner))
	}

	<-ctx.Done()
	return ctx.Err()
}

func (s *stream) attached(t *testing.T) remotecommand.StreamOptions {
	t.Helper()

	select {
	case options := <-s.options:
		return options
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for the stream to be attached")
		return remotecommand.StreamOptions{}
	}
}

func newRunner(t *testing.T, banner string, clientset kubernetes.Interface) (*Runner, *recorder, *stream) {
	t.Helper()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{Clientset: clientset})
	bus := &recorder{chunks: make(chan domain.ExecChunk, 32)}
	shell := &stream{options: make(chan remotecommand.StreamOptions, 1), banner: banner}

	runner := NewRunner(clusters{conn: conn}, bus)
	runner.dial = func(*cluster.Connection, domain.ContainerTarget, domain.ExecOptions) (remotecommand.Executor, error) {
		return shell, nil
	}
	return runner, bus, shell
}

func target() domain.ContainerTarget {
	return domain.ContainerTarget{Namespace: "default", Pod: "api-1", Container: "api"}
}

func decode(t *testing.T, data string) string {
	t.Helper()

	out, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		t.Fatalf("chunk data is not base64: %v", err)
	}
	return string(out)
}

func TestStartPublishesWhatTheContainerWrites(t *testing.T) {
	runner, bus, _ := newRunner(t, "/ # ", nil)

	opts := domain.ExecOptions{Command: []string{"sh"}, TTY: true, Cols: 100, Rows: 30}
	if err := runner.Start("token-1", "test", target(), opts); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runner.Stop("token-1") })

	chunk := bus.next(t)
	if chunk.Token != "token-1" {
		t.Errorf("token = %q, want token-1", chunk.Token)
	}
	if got := decode(t, chunk.Data); got != "/ # " {
		t.Errorf("data = %q, want %q", got, "/ # ")
	}
	if chunk.Done {
		t.Error("a live session should not report done")
	}
}

func TestSendReachesTheContainersStdin(t *testing.T) {
	runner, _, shell := newRunner(t, "", nil)

	if err := runner.Start("token-1", "test", target(), domain.ExecOptions{TTY: true}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runner.Stop("token-1") })

	options := shell.attached(t)

	// The pipe carrying keystrokes is synchronous, so the reader has to be waiting.
	typed := make(chan string, 1)
	go func() {
		line, _ := bufio.NewReader(options.Stdin).ReadString('\n')
		typed <- line
	}()

	if err := runner.Send("token-1", "ls -la\n"); err != nil {
		t.Fatal(err)
	}

	select {
	case line := <-typed:
		if line != "ls -la\n" {
			t.Errorf("stdin = %q, want %q", line, "ls -la\n")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("nothing reached the container's stdin")
	}
}

func TestTheTerminalStartsAtTheSizeTheFrontendAsksFor(t *testing.T) {
	runner, _, shell := newRunner(t, "", nil)

	opts := domain.ExecOptions{TTY: true, Cols: 120, Rows: 40}
	if err := runner.Start("token-1", "test", target(), opts); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runner.Stop("token-1") })

	options := shell.attached(t)
	if size := options.TerminalSizeQueue.Next(); size == nil || size.Width != 120 || size.Height != 40 {
		t.Fatalf("first size = %+v, want 120x40", size)
	}

	if err := runner.Resize("token-1", 80, 24); err != nil {
		t.Fatal(err)
	}
	if size := options.TerminalSizeQueue.Next(); size == nil || size.Width != 80 || size.Height != 24 {
		t.Fatalf("resized to %+v, want 80x24", size)
	}
}

func TestATTYAsksForNoStderr(t *testing.T) {
	runner, _, shell := newRunner(t, "", nil)

	if err := runner.Start("token-1", "test", target(), domain.ExecOptions{TTY: true}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runner.Stop("token-1") })

	if options := shell.attached(t); options.Stderr != nil {
		t.Error("a TTY session must not ask for a separate stderr stream")
	}
}

func TestStopEndsTheSessionAndReportsIt(t *testing.T) {
	runner, bus, _ := newRunner(t, "", nil)

	if err := runner.Start("token-1", "test", target(), domain.ExecOptions{TTY: true}); err != nil {
		t.Fatal(err)
	}
	if err := runner.Stop("token-1"); err != nil {
		t.Fatal(err)
	}

	if chunk := bus.next(t); !chunk.Done || chunk.Error != "" {
		t.Errorf("final chunk = %+v, want a clean done", chunk)
	}
	if err := runner.Send("token-1", "ls\n"); err == nil {
		t.Error("sending to a stopped session should fail")
	}
}

func TestStartRejectsADuplicateToken(t *testing.T) {
	runner, _, _ := newRunner(t, "", nil)

	if err := runner.Start("token-1", "test", target(), domain.ExecOptions{TTY: true}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runner.Stop("token-1") })

	if err := runner.Start("token-1", "test", target(), domain.ExecOptions{TTY: true}); err == nil {
		t.Error("attaching twice under one token should fail")
	}
}

func TestStartRefusesADisconnectedCluster(t *testing.T) {
	runner, _, _ := newRunner(t, "", nil)

	if err := runner.Start("token-1", "other", target(), domain.ExecOptions{TTY: true}); err == nil {
		t.Error("attaching to a cluster that is not connected should fail")
	}
}

func TestExecURLCarriesTheCommandAndTheTTY(t *testing.T) {
	config := &rest.Config{Host: "https://api.example:6443"}
	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{
		Config:    config,
		Clientset: clientset,
	})

	opts := domain.ExecOptions{Command: []string{"sh", "-c", "top -b"}, TTY: true}
	url := execURL(conn, target(), opts)

	if url.Path != "/api/v1/namespaces/default/pods/api-1/exec" {
		t.Errorf("path = %q", url.Path)
	}
	query := url.Query()
	if got := query["command"]; len(got) != 3 || got[2] != "top -b" {
		t.Errorf("command = %v", got)
	}
	if query.Get("container") != "api" || query.Get("tty") != "true" || query.Get("stdin") != "true" {
		t.Errorf("query = %v", query)
	}
	if _, asked := query["stderr"]; asked {
		t.Errorf("query = %v, want no stderr stream alongside a TTY", query)
	}
}

func runningPods(clientset *fake.Clientset, name string) {
	clientset.PrependReactor("create", "pods", func(action k8stesting.Action) (bool, runtime.Object, error) {
		pod := action.(k8stesting.CreateAction).GetObject().(*corev1.Pod).DeepCopy()
		pod.Name = name
		pod.Status.Phase = corev1.PodRunning

		return true, pod, clientset.Tracker().Add(pod)
	})
}

func TestNodeShellRunsAPrivilegedPodOnTheNode(t *testing.T) {
	clientset := fake.NewClientset()
	runningPods(clientset, "nens-node-shell-xyz")
	runner, _, _ := newRunner(t, "", clientset)

	if err := runner.NodeShell(context.Background(), "token-1", "test", "worker-1", domain.ExecOptions{}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runner.Stop("token-1") })

	pod, err := clientset.CoreV1().Pods(nodeShellNamespace).Get(context.Background(), "nens-node-shell-xyz", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if pod.Spec.NodeName != "worker-1" || !pod.Spec.HostPID {
		t.Errorf("pod is not pinned to the node's namespaces: %+v", pod.Spec)
	}
	if security := pod.Spec.Containers[0].SecurityContext; security == nil || security.Privileged == nil || !*security.Privileged {
		t.Error("the node shell container has to be privileged")
	}
}

func TestNodeShellRemovesItsPodWhenTheSessionEnds(t *testing.T) {
	clientset := fake.NewClientset()
	runningPods(clientset, "nens-node-shell-xyz")
	runner, bus, _ := newRunner(t, "", clientset)

	if err := runner.NodeShell(context.Background(), "token-1", "test", "worker-1", domain.ExecOptions{}); err != nil {
		t.Fatal(err)
	}
	if err := runner.Stop("token-1"); err != nil {
		t.Fatal(err)
	}
	bus.next(t)

	if _, err := clientset.CoreV1().Pods(nodeShellNamespace).
		Get(context.Background(), "nens-node-shell-xyz", metav1.GetOptions{}); err == nil {
		t.Error("the debug pod should be gone once the shell closes")
	}
}

func TestNodeShellNeedsANode(t *testing.T) {
	runner, _, _ := newRunner(t, "", fake.NewClientset())

	if err := runner.NodeShell(context.Background(), "token-1", "test", "", domain.ExecOptions{}); err == nil {
		t.Error("a node shell without a node should fail")
	}
}
