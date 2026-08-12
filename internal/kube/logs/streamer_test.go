package logs

import (
	"context"
	"testing"
	"time"

	"nens-k8s/internal/domain"
	"nens-k8s/internal/kube/cluster"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

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

func newStreamer(t *testing.T) (*Streamer, *recorder, *fake.Clientset) {
	t.Helper()

	clientset := fake.NewClientset()

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	conn := cluster.NewConnection(ctx, domain.Cluster{ID: "test"}, cluster.Clients{Clientset: clientset})
	bus := &recorder{chunks: make(chan domain.LogChunk, 32)}
	return NewStreamer(clusters{conn: conn}, bus), bus, clientset
}

func TestStartStreamsLinesAndFinishes(t *testing.T) {
	streamer, bus, _ := newStreamer(t)

	target := domain.ContainerTarget{Namespace: "default", Pod: "api-1", Container: "api"}
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

	target := domain.ContainerTarget{Namespace: "default", Pod: "api-1", Container: "api"}
	streamer.streams["token-1"] = func() {}

	if err := streamer.Start("token-1", "test", target, domain.LogOptions{}); err == nil {
		t.Error("starting a stream twice under one token should fail")
	}
}

func TestStartSendsThePodLogOptions(t *testing.T) {
	streamer, bus, clientset := newStreamer(t)

	target := domain.ContainerTarget{Namespace: "default", Pod: "api-1", Container: "sidecar"}
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

	target := domain.ContainerTarget{Namespace: "default", Pod: "api-1", Container: "api"}
	if err := streamer.Start("token-1", "other", target, domain.LogOptions{}); err == nil {
		t.Error("streaming from a cluster that is not connected should fail")
	}
}
