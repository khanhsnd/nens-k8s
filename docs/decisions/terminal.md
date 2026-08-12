# Terminal

Exec sessions, the xterm panel, and the node shell.

### Container resolution left `logs` and became its own adapter

`logs.Streamer.Targets` answered "what can I attach to" for the Logs panel. A shell asks the same
question, so the resolution moved to `internal/kube/pods` (`Resolver.Targets`, plus `Selected`/`Get`
as the pod lookup the forward registry also needs) and `domain.LogTarget` became
`domain.ContainerTarget`. One binding — `ContainerAPI.Targets` — now serves both panels, and
`features/containers` mirrors it on the frontend so `features/terminal` never imports
`features/logs`.

The alternative was a second resolver for exec: ~150 lines of Go and ~80 of fixtures duplicated, and
two answers to one question that would drift.

### xterm.js here, but not for logs

The log panel rejected xterm.js because a terminal emulator cannot filter its own scrollback. Exec is
the opposite case: it needs input, cursor addressing, escape sequences and a real cell grid, and none
of the log panel's features (filter, match stepping, wrap toggle) apply. So the two panels
deliberately do not share a renderer — they only share the container picker's data.

The terminal's palette is read from the CSS custom properties, not hardcoded, and re-read when
`theme.store` flips, because xterm paints its own cells and cannot inherit Tailwind tokens.

### Output is base64 bytes, input is a plain string

`ExecChunk.Data` is base64: a terminal writes arbitrary bytes and a multi-byte rune can straddle two
reads, so decoding on the Go side would corrupt it. The frontend decodes to a `Uint8Array` and hands
it to `Terminal.write`, which owns UTF-8 reassembly across chunks.

`Send(token, data)` takes the string xterm's `onData` produced — keystrokes and escape sequences are
text by construction, and `[]byte(s)` is the exact wire form the API server wants.

### The output sink never drops, and flushes early instead

`logs.sink` drops the oldest lines past its window because a flooding pod's newest lines are the
interesting ones. A terminal cannot do that: dropping bytes truncates an escape sequence and corrupts
everything after it. So `exec.sink` batches on a 16ms window (one frame — echo latency is felt, unlike
log latency) and flushes immediately past 64KB rather than dropping anything.

The frontend does not coalesce on top of that: xterm has its own write queue, and a second buffer
would only add latency.

### The size queue is latest-wins, and closing it is what stops the goroutine

A resize nobody has read yet is worthless once the window has moved again, so `sizeQueue` holds one
size and replaces it. It must also be closed: `remotecommand` runs a goroutine blocked in `Next()`
for the life of the stream, and only a `nil` return — which a closed channel produces — makes it
exit. Every teardown therefore goes through `Runner.close`, which closes the queue, closes the stdin
pipe and cancels the context.

### Keystrokes go through an `io.Pipe`, which is synchronous on purpose

`Send` blocks until the stream consumes the bytes, which is the backpressure a terminal wants and
what `kubectl` does with `os.Stdin`. The failure mode — a wedged connection leaving a `Send` promise
pending — is bounded: `Stop` closes the pipe writer and every blocked `Write` returns
`ErrClosedPipe`. Buffering keystrokes into a channel instead would need a second goroutine to keep
their order, for a case where the terminal is already unusable.

### The executor is built behind a seam, and the URL is asserted separately

`Runner.dial` defaults to `remotecommand.NewSPDYExecutor` and is replaced in tests, because the fake
clientset's `RESTClient()` is a nil `*rest.RESTClient` — `Post()` on it panics, so an exec URL cannot
be built from it at all. `execURL` is therefore tested against a real clientset dialled at an
unreachable host (building a URL touches no network), and the session state machine is tested against
a fake executor. Nothing in the exec package needs an API server to be covered.

### The node shell is one call that owns the pod

`NodeShell(token, cluster, node, opts)` creates the privileged pod, waits for Running, attaches
`nsenter --target 1 --mount --uts --ipc --net --pid -- sh -l`, and registers the pod's deletion as
the session's cleanup. Exposing "create a debug pod" to the frontend was the obvious alternative and
leaks pods: the frontend would own the delete, and a closed window, a reload or a failed attach would
each leave a privileged pod behind. The container itself only sleeps — the shell enters the host's
namespaces through PID 1 — so the image needs nothing but `nsenter`.
