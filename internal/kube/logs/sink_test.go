package logs

import (
	"errors"
	"strconv"
	"testing"

	"nens-k8s/internal/domain"
)

func TestSinkDropsTheOldestLinesWhenItOverflows(t *testing.T) {
	bus := &recorder{chunks: make(chan domain.LogChunk, 4)}
	out := newSink(bus, "token-1")

	for i := range maxPending + 10 {
		out.push(strconv.Itoa(i) + "\n")
	}
	out.close(nil)

	chunk := bus.next(t)
	if chunk.Dropped != 10 {
		t.Errorf("dropped = %d, want 10", chunk.Dropped)
	}
	if len(chunk.Lines) != maxPending {
		t.Fatalf("kept %d lines, want %d", len(chunk.Lines), maxPending)
	}
	if chunk.Lines[0] != "10" {
		t.Errorf("oldest kept line = %q, want %q — the newest lines must survive", chunk.Lines[0], "10")
	}
}

func TestSinkStopsPublishingAfterClose(t *testing.T) {
	bus := &recorder{chunks: make(chan domain.LogChunk, 4)}
	out := newSink(bus, "token-1")

	out.close(nil)
	out.push("late line\n")
	out.close(nil)

	if chunk := bus.next(t); !chunk.Done || len(chunk.Lines) != 0 {
		t.Fatalf("unexpected chunk: %+v", chunk)
	}
	if len(bus.chunks) != 0 {
		t.Error("a closed sink should publish nothing further")
	}
}

func TestSinkReportsTheReadFailureOnTheFinalChunk(t *testing.T) {
	bus := &recorder{chunks: make(chan domain.LogChunk, 4)}
	out := newSink(bus, "token-1")

	out.push("last line before the break\n")
	out.close(errors.New("connection reset by peer"))

	chunk := bus.next(t)
	if chunk.Error != "connection reset by peer" || !chunk.Done {
		t.Fatalf("unexpected chunk: %+v", chunk)
	}
	if len(chunk.Lines) != 1 {
		t.Error("lines buffered before the failure must still reach the frontend")
	}
}

func TestCleanTruncatesAbsurdLines(t *testing.T) {
	line := make([]byte, maxLineBytes+500)
	for i := range line {
		line[i] = 'x'
	}

	if got := clean(string(line)); len(got) != maxLineBytes+len("…") {
		t.Errorf("length = %d, want %d", len(got), maxLineBytes+len("…"))
	}
	if got := clean("plain\r\n"); got != "plain" {
		t.Errorf("clean(%q) = %q, want %q", "plain\r\n", got, "plain")
	}
}
