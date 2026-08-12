# Decisions

Why the code looks the way it does. Append a new entry whenever a choice is not
obvious from reading the code — especially when the obvious alternative is wrong.

## Phase 2 — live resources

### The frontend supplies the subscription token

`ResourceAPI.Subscribe(token, clusterID, gvr, namespace)` takes the token instead of
returning a generated one.

The backend publishes the initial snapshot as a `resource:event` **before** `Subscribe`
returns. With a backend-generated token, that event reaches JS before the promise
resolves, so the frontend has no `token → slice` mapping yet and silently drops the
snapshot. That is the common case, not a rare race. A client-generated token lets the
frontend register the mapping synchronously before it ever calls the binding.

### The snapshot is an event, not the return value

Everything a watch publishes goes out under the watch mutex, so the frontend receives
`snapshot → deltas` in order. If the snapshot travelled back as the `Subscribe` return
value it would arrive *after* deltas that were already broadcast to the new token, and
the `reset` flag would then wipe them.

### One informer per (cluster, GVR, namespace), ref-counted by token

`resource.Store` creates the informer on first subscribe and cancels it when the last
token leaves. Its context derives from the cluster connection context, so
`Disconnect`/`Shutdown` stops every informer of that cluster; a goroutine per watch
waits on `ctx.Done()` and removes the dead entry from the store maps.

This is why `cluster.Connection` no longer owns a `DynamicSharedInformerFactory` — that
factory can only be shut down as a whole, which makes per-GVR ref-counting impossible.
`Connection.Close()` is just `cancel()`.

### Coalescing is a 100ms window keyed by UID

`watch.pending` is a `map[uid]delta`, so the last event per object wins and a 10-minute
resync of 5k pods becomes one batch of 5k events instead of 5k messages. Deleted events
carry no object — the frontend only needs the UID to drop it from its map.

Objects are deep-copied before `managedFields` and the `last-applied-configuration`
annotation are stripped: informer cache objects are shared, mutating them corrupts the
cache for every other reader.

### Events with no subscribers are dropped, and attach is atomic

`enqueue` returns early when the watch has no tokens. A token is registered and its
snapshot taken under the same mutex, so no event can slip between "informer store read"
and "token starts receiving" — the snapshot is always at least as new as anything that
was dropped.

### Subscriptions follow open tabs, not mounted views

`AppShell` reconciles the desired subscription set from `open tabs × active cluster`.
Subscribing from the view's mount effect instead would tear down and re-list an informer
every time the user switches tab.

### Namespace filtering is client-side for now

The frontend always subscribes with namespace `""` and filters rows in the table. The
backend already keys watches by namespace, so the roadmap's ">5k pods → watch only the
namespaces in view" optimisation is a frontend change only.

### `offline` lives in the cluster store

The resource store checks `useClusters.getState().offline` before calling a binding
rather than catching a bridge error itself. One flag then covers both causes of fixture
mode — no Wails bridge (browser dev) and an unreadable kubeconfig — and fixture clusters
can never imply live resources.

### A resource kind is data

`features/resources/kinds.ts` maps a nav leaf id to `{ gvr, namespaced, columns }`. The
detail drawer renders its Overview fields from the same `Column[]`, so adding a kind is
one columns file plus one registry entry, and never a component.

## Adding kubeconfigs

### `internal/config` arrived early

Phase 9 owns settings persistence, but "add a kubeconfig" is pointless if it does not
survive a restart. `config.Store` is the seed of that package: JSON at
`os.UserConfigDir()/Nens/settings.json`, currently one key (`kubeconfigs`). It never
fails to construct — a missing user config dir is reported by `Dir()`/`Save` so the error
surfaces in the dialog instead of at startup.

### Added files are extra `Precedence` entries, not a replacement

`kubeconfig.Loader.rules()` rebuilds `clientcmd.NewDefaultClientConfigLoadingRules()` on
every call and appends the saved paths. So `KUBECONFIG` and `~/.kube/config` keep working
and keep winning on duplicate context names, and a file added in the UI is visible to the
next `Clusters()` call without a restart. Building the rules once in the constructor —
which is what the code did before — would have frozen the list at startup.

### Paste writes a file, it does not store the YAML

`Import` validates with `clientcmd.Load`, then writes to
`os.UserConfigDir()/Nens/kubeconfigs/<context-slug>.yaml` and tracks that path like any
other. One code path afterwards, and `exec` credential plugins keep working because they
are just fields in the file.

`Remove` deletes the file only when it sits inside that imported directory — a kubeconfig
the user merely pointed at is never touched, only unreferenced.

### The native file dialog lives in `internal/app`

`KubeconfigAPI.Pick` calls `runtime.OpenFileDialog`. `internal/app` is the Wails edge, so
the import belongs there; a webview `<input type="file">` cannot give an absolute path,
and reading the contents instead would turn "point at my kubeconfig" into a silent copy
that goes stale.

## Cluster settings

### Renaming a cluster is a settings alias, not a kubeconfig edit

`ClusterAPI.Rename(id, name)` stores `clusterNames[context] = name` in `settings.json`, and
`kubeconfig.Loader.Clusters()` lays that over the context name when it builds each
`Cluster`. Rewriting the context name inside the kubeconfig file was the obvious
alternative and is wrong: `Cluster.ID == Context` is the identity every tab, subscription
and informer is keyed by, other tools read the same files, and a file Nens merely points at
is not ours to rewrite. An empty name drops the alias, so the context name comes back.

`Connection` gained a mutex for this. `Registry.List()` answers from `conn.Meta()` for a
connected cluster, so the rename has to land on the connection's own copy — which the Wails
goroutine reads while the rename writes it — and it must not disturb the live phase and
version there.

## Grid selection and row actions

### Clicking a cell tints the whole row, but the selection rect stays a rect

Rows inside the selection rect get `bg-raised`; cells inside it keep `bg-accent-dim`, and
the drawer's row keeps `bg-accent-dim` across its full width. Widening the rect itself to
the whole row on click would make "select the row" literal at the cost of column-range
drag, and would turn every `Ctrl+C` into a full-row copy.

### The row actions cell is the last grid column, not an overlay

`DataGrid` appends a fixed track to the template and renders a `sticky right-0` cell
holding the three-dot button. Being a real column keeps the header and the body on the same
grid and stops the button from covering data; it repeats the row background because sticky
content scrolls over the cells behind it. It is deliberately not a `Column` in the kind's
spec — selection, copy and keyboard navigation are keyed by `columns.length` and must not
see it.

## Column layout

### The layout is per grid id, the spec stays immutable data

`shared/ui/grid.layout.ts` keeps `{ order, hidden, widths }` per `layoutId` (the kind id) in one
localStorage key, and `useGridLayout` folds it over the kind's `Column[]`. The columns file stays
the single description of a kind — `hidden: true` is the *default* visibility, `fixed: true` marks
a column the menu cannot untick — and user preference never edits it. Unknown saved keys are
ignored and new columns land at their spec position, so shipping a column never breaks a saved
layout.

Widths are stored per key: a column the user never dragged keeps its `minmax(min, grow fr)` track,
a dragged one becomes a fixed px track. Width `0` means "auto" again, which is what
double-clicking the resize handle writes.

### Reorder is pointer-based, not HTML5 drag-and-drop

Header reordering listens on `pointerdown/move/up` and resolves the drop column with
`document.elementFromPoint` → `[data-column]`, the same shape as the cell range drag. The `draggable`
attribute was the obvious alternative and is worse here: `dataTransfer` drags are unreliable inside
the WebView2 host and untestable from the browser harness.

### The column menu lives outside the scrolled header

The header is a flex row: a clipped track area that translates with the body's `scrollLeft`, plus a
fixed 36px cell holding the menu. That cell is a sibling of the scrolled area rather than a `sticky`
last track, because sticky inside the translated grid does not stay pinned. `scrollbar-gutter: stable`
on the flex row makes its content box match the body's, so header tracks stay aligned with the row
cells and the menu sits exactly over the row-actions column.

### Pod warnings are derived from container state, not events

`podWarnings` flags a container that waits on anything other than `ContainerCreating`/
`PodInitializing`, terminates non-zero, or is not ready while the pod says `Running`. Lens computes
that column from warning `Event` objects — we have no events until phase 3, and container state is
the signal that actually explains the row. Restart count alone is deliberately not a warning: a pod
that restarted once a week ago would then stay yellow forever.

### CPU/Memory columns exist but have no source yet

They read `K8sObject.metrics`, which nothing populates until phase 7 wires `metrics.k8s.io`, so they
ship hidden by default and render `—` when ticked. Shipping them visible would put two dead columns
in front of every user; leaving them out would mean re-doing the column spec in phase 7.

## Phase 3 — detail, YAML, events

### Writes are a second adapter, not more `Store`

`resource.Store` owns informers; `resource.Editor` owns one-shot reads and writes. They share the
package (and `trim`) but nothing else — the store is stateful and ref-counted, the editor is
stateless and per-call. `ResourceAPI` holds both ports, which is why `NewResourceAPI` takes two
arguments.

`cluster.NewConnection` exists so the editor can be tested with a fake dynamic client and a static
`RESTMapper`; `Dial` is now the "build the clients from a `rest.Config`" path on top of it.

### Apply is forced server-side apply, and the resourceVersion is the concurrency check

`Apply` sends the edited object as an apply patch with field manager `nens` and `Force: true`, the
same shape as `kubectl apply --server-side --force-conflicts`. The editor loads the object with
`Get`, so the buffer still carries `metadata.resourceVersion` — the API server then rejects the
apply if anything changed underneath, and the drawer's Reload button is the way out. Dropping
`resourceVersion` before sending would silently overwrite a concurrent change.

`k8s.io/client-go/dynamic/fake` cannot merge apply patches into unstructured objects, so
`TestApplySendsTheEditedObjectAsAnApplyPatch` asserts the request through a reactor instead of the
stored result.

### Scale patches the `scale` subresource

A merge patch of `spec.replicas` on the main resource would work for Deployments, but the subresource
is what RBAC `scale` verbs and CRDs with a scale subresource expose, so `Scale` patches
`.../scale` — one code path for every scalable kind.

### The YAML tab reads through `Get`, not the informer cache

The cache is the source of truth for tables, and re-reading a single object for the drawer is not the
re-`List` the performance budget forbids. It matters that the editor buffer is a snapshot: an object
that keeps arriving from the watch would fight the user's cursor, and applying a cache object could
send a `resourceVersion` older than what is stored.

### YAML lives in the frontend

`Get`/`Apply` move `map[string]any` over the bridge and the `yaml` package renders and parses it in
the browser. Go marshals maps with sorted keys, which is exactly what `kubectl get -o yaml` prints,
so nothing is lost — and parse errors surface in the drawer before a round trip, while fixture mode
gets a YAML tab for free.

### The dirty guard is a store, not a prop

`features/resources/editor.store.ts` holds `dirty` plus one `pending` action. Anything that would
throw the buffer away — the drawer's close button, its tab strip, selecting another row in
`AppShell` — calls `guard(action)`, and `DiscardGuard` renders the confirmation when a pending
action exists. Threading a callback down instead would have stopped at the drawer, and row selection
lives two components above it. Closing the app tab is deliberately not guarded: the tab is the
subscription's owner, and blocking it would mean blocking cluster switches too.

## Panels

### Logs live in a bottom dock, not the detail drawer

The drawer is 460px of a side panel — the wrong shape for the thing people stare at longest. Logs
moved to `features/dock`, a full-width panel above the status bar with its own tab strip, so several
pods can stream at once and each gets the window's full width. Phase 5's shell is the second tool of
the same dock; `DockTool.kind` is the only thing that grows.

Inactive dock tools stay mounted behind `hidden` rather than being unmounted. A dock tab is a live
stream — unmounting on every tab switch would restart it, which is exactly what phase 2 avoided for
resource subscriptions.

The drawer keeps Overview / YAML / Events, and its header is a flat row of icon actions — Logs first,
then Scale, Copy, Delete — instead of the `⋯` dropdown it used to be. Logs is the action people reach
for most; one click behind a menu is where it went missing. Which kinds show it is data, like
everything else about a kind: `Kind.logs` in `features/resources/kinds.ts`.

### One `Resizer`, one persisted size store

`shared/ui/Resizer.tsx` drags one edge of *its own parent* — it measures the parent's box at
pointerdown and reports the new size, so there is no per-panel arithmetic and no hardcoded offset
(the sidebar's handle used to subtract the cluster rail's 56px by hand). `shared/ui/panel.size.ts`
keeps every panel's size under one localStorage key, clamped to per-panel bounds, which is why
`sidebarWidth` left `nav.store`.

Bounds are a preference; the viewport is a hard limit. So the store clamps to a fixed min/max and the
panel additionally carries a CSS `max-w-[70vw]` / `max-h-[80vh]`, which keeps a size saved on a large
monitor from swallowing a small window.

## Phase 4 — logs

### A virtualized line list, not xterm.js

The roadmap called for xterm.js plus its search addon. It is the wrong tool here: a terminal emulator
owns its own scrollback as a cell grid, so "show only the lines matching this regex" is impossible,
match navigation means rescanning that grid, and 200k lines of cells cost far more memory than 200k
strings. The list is the same `@tanstack/react-virtual` shape every other view already uses, which is
also what the performance budget demands. Terminal fidelity is not lost by much — ANSI colour codes
are stripped on ingest (`shared/lib/ansi.ts`) and severity is tinted from the text instead.

Phase 5 still needs xterm.js: `exec` is a real terminal with input, resize and cursor addressing.

### The scrollback lives outside React

`LogBuffer` is a plain class holding the line array; the store only publishes a `version` counter.
Putting 200k lines in zustand state would deep-copy the array on every 100ms chunk. Its `size()/at()`
pair is what the virtualizer reads, so nothing ever materialises a filtered copy of the buffer either.

Trimming is amortised: the array is allowed to run a tenth over capacity so the `splice` happens once
per ~5k lines instead of once per line. 200k lines of realistic log text measured ~47 MB of heap,
which is why 50k is the default and 200k is opt-in.

### The search index is incremental, the highlight is not

`LogBuffer.matches` holds the positions of matching lines and is extended as each chunk arrives, so a
streaming log never rescans what is already buffered — only changing the query does (25ms over 200k
lines). The same index answers both the filter view and match stepping.

Highlight spans are computed per *visible* row at render time. Storing them per line would multiply
the memory of the thing this design exists to keep small.

### Row heights are keyed by the line, and computed rather than measured

Two things renumber the rows under the virtualizer: trimming the scrollback, and switching the search
filter on. `@tanstack/react-virtual` caches measured heights by `getItemKey(index)`, which **defaults
to the index** — so after either of those, row 5 is handed the height of whatever line used to be at
row 5. Wrapped rows then render taller than their slot and pile on top of each other, which is what a
search over a streaming log looked like. `getItemKey` returns `line.n` instead, so a height always
follows its own line.

That alone is not enough: the virtualizer only rebuilds offsets from index 0 when it notices the edge
keys changed, and it only looks for that under `anchorTo: 'end'`. That option is wanted here anyway —
it keeps the viewport on the line you were reading when the front of the buffer is trimmed away. The
cost is a full measurement pass per arriving batch (~4ms at the default 50k lines), paid only while
log lines are actually arriving.

`estimateSize` is then arithmetic, not a guess: the font is monospace and the message column wraps
with `break-all`, so height is `ceil(characters / columns) * lineHeight`, with `columns` derived from
a hidden probe span and a `ResizeObserver` on the scroller (panels are resizable now). Tabs are
expanded on ingest so the character count matches what is painted. `measureElement` stays on as the
corrector for anything the arithmetic cannot know — double-width glyphs, mostly — but it no longer has
to fix up every row on every batch, which is what made it visibly lose the race.

### One stream per container, merged in the frontend

`Start` streams exactly one container, and "all containers" is N tokens pointing at one buffer, each
tagged with a label the lines carry. The backend stays one-stream-one-goroutine, and the ordering
question ("which pod's line came first") is answered by arrival order in one place. `kubectl
--all-containers` does the same fan-out client-side.

### `Targets` resolves anything that owns pods

Rather than restricting the Logs tab to pods, `Targets(ref)` reads a pod's containers directly, and
for anything else follows `spec.selector` — a `LabelSelector` for workloads, a plain label map for
services — and lists up to 200 pods. So the Logs tab is useful on a Deployment, which is where log
reading usually starts. A CronJob is deliberately not resolved: it owns Jobs, not pods.

### Follow is auto-scroll; the backend always follows

The UI's follow toggle only controls scrolling. Wiring it to `PodLogOptions.Follow` would mean
scrolling up stops the stream and scrolling back down reloads the buffer. Leaving is detected by
"scrolled upwards **and** now far from the bottom" — re-measuring a wrapped row can move `scrollTop`
by a few pixels, and either half of that test alone would turn following off by itself.

`previous: true` is the one case that forces `Follow: false` — the API server rejects following a
container that has already died.

### Backpressure is drop-oldest inside the flush window

`sink` is the same shape as the resource watch's coalescer: a pending slice flushed every 100ms. Past
5k pending lines the oldest are dropped and counted, and the count rides along on the next chunk so
the footer can show a real gap. Dropping the *newest* would be the obvious alternative and is wrong —
when a pod floods, the lines you want are the ones it just wrote.

## Phase 5 — exec and port-forward

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

Phase 4 rejected xterm.js because a terminal emulator cannot filter its own scrollback. Exec is the
opposite case: it needs input, cursor addressing, escape sequences and a real cell grid, and none of
the log panel's features (filter, match stepping, wrap toggle) apply. So the two panels deliberately
do not share a renderer — they only share the container picker's data.

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

### A forward carries its own id, so it needs no client-supplied token

Resource subscriptions and log streams take a frontend token because their first event races the
call's return (see above). A `PortForward` event carries the whole record, id included, so a store
keyed by id can apply an event that arrives before `Start` resolves. `Start` still returns the
`starting` record, and `forward:changed` reports every transition after it.

### `finish` is the only teardown path

`Stop` and `ForwardPorts` returning are two racing ends of the same forward, so both go through
`finish`, and membership in the registry map decides which one reports the final state — the loser
finds the entry gone and stays quiet. That is also why `Stop` closes the stop channel rather than
calling `PortForwarder.Close`: one signal, and `ForwardPorts` unwinds itself.

Each forward also gets a goroutine on the cluster connection's context, because `portforward` takes a
stop channel and not a context. Without it a forward would outlive the cluster it points at.

### Local port 0 is the default, and `GetPorts()` is when it becomes real

Asking the kernel for a port is what avoids "address already in use" on every second forward, so the
dialog's local port is optional. The actual number only exists after the ready channel fires, which
is what `activate` waits for and publishes — the row shows `starting` until then.

For a service, the forwarded number is its `targetPort` when that is numeric: the tunnel lands on a
pod, so the service port would be the wrong number. A named `targetPort` cannot be resolved without
the pod's container spec, so it falls back to the service port and the user can correct it.

### Port Forwarding is a view over the registry, not a resource kind

It has no GVR and no informer, so it is not in `kinds.ts` and `AppShell` renders it from the leaf id.
Its rows still go through `shared/ui/DataGrid` with a `Column<PortForward>[]` spec, so virtualization,
selection, copy and the column menu come for free — the grid was already generic over its row type.

### A grid cell centres its content with flexbox, never with the row's line-height

The cell used to set `line-height: 30px` (the row height) to centre its text, and that is what made
bordered chips overflow their row: an `inline-flex` pill *inherits* that leading, so a 10.5px label
became a ~32px box inside a 30px row and got clipped. The workaround of resetting leading per chip
only moved the problem — a cell renderer that is block-level (`flex`) ignores the line box entirely
and hugs the top of the row instead.

So the cell is now `flex items-center` with its content in one `min-w-0 flex-1 truncate` span:
vertical centring comes from flexbox and applies to text and components alike, and truncation still
lives on a single element that owns the ellipsis. `shared/ui/Badge.tsx` also grew a `Pill` primitive
with a fixed height and `leading-none`, so chips have one definition instead of an ad-hoc span per
call site.

The rule this file exists to record: **anything a column renders must not depend on the cell's
typography to size itself.** Measure a chip against its row (`getBoundingClientRect`) before calling
it done — this class of bug is invisible until a border is drawn around it.

### Row actions fill the sticky cell, they are not a column of their own

Copy and Stop first shipped as a last `Column` with `min: 62`, which put them left of the grid's own
36px sticky actions cell: two buttons crammed into a normal cell, then an empty gutter, misaligned
with the header's column menu. `DataGrid` now takes `rowActions?: (row) => ReactNode` that fills the
sticky cell instead of the open-details button, and widens that track to 76px when it is used. The
header's menu cell reads the same width, so the two stay aligned — which is the whole reason the
actions cell is a real grid track (see "The row actions cell is the last grid column").

Forwards therefore keep a pure `FORWARD_COLUMNS` data spec, and the view owns its buttons.

### Forwarding lives in the drawer's Overview, not behind a header icon

The icon in the drawer header opened a dialog that asked for the port a second time — the object's
ports were already known. `features/portforward/ForwardPanel` renders one row per declared port
(`ContainerPort` for pods and workloads, the pod-side `targetPort` for services) with an inline local
port field, and flips that row to the live address plus Copy/Stop once the forward is up. So the
question the panel answers is "which of these ports do I want", not "type a number", and stopping a
forward is where starting it was.

`ObjectOverview` renders it whenever `kind.forward` is set, so this is still one capability flag in
`kinds.ts` and not a per-kind component. The header keeps only the actions that have nowhere else to
live (Logs, Shell, Scale, Copy, Delete).

### The `Forwarded` column reads the registry, not the object

Nothing on a Service says it is being forwarded — that state lives in the forward registry. So
`forwardedColumn(resource)` renders a component that subscribes to `useForwards`, and matches on
cluster + namespace + name + resource. Resource is part of the key because a Deployment and its
Service usually share a name, and matching on the name alone would light up the wrong row.

Its `text()` — what Ctrl+C copies — reads the same state imperatively through `getState()`, because a
`Column` is data and cannot hold a hook.

## Cluster switching

### The icon rail became one tree: clusters are the top level of the nav

`ClusterRail` was 56px of two-letter avatars, so telling `fim-dev` from `fim-prod` meant
hovering each one and reading a tooltip — the app's primary navigation was hover-only. The
sidebar is now a single tree in the shape Lens uses: every context is a row with its display
name, and the active one unfolds into the resource sections beneath it.

A header dropdown was the intermediate version and is worse: the cluster list and the resource
tree are the same act of navigation ("which cluster's pods"), and splitting them means the
list you switch in is invisible while you are looking at what you switched to.

`app/layout/Sidebar.tsx` stays composition — it maps clusters to
`features/clusters/ClusterNode.tsx` and passes `features/navigation/NavTree.tsx` as each
node's children, so the cluster feature never imports the nav model and vice versa.

### The open cluster *is* the active cluster

There is no `expandedClusterId`. A node renders its children when `cluster.id === activeId`,
so clicking a row is one action — connect, switch, unfold — and the previous cluster's tree
folds by itself. A second state would have to be kept in sync with every other path that
changes the active cluster (the command palette, `cluster:changed` events) and would let the
user expand cluster A while browsing cluster B's pods.

`nav.store` adds only `collapsedCluster: string | null` — the one cluster the user folded by
hand. Activating another cluster leaves that id behind, so the new tree is open without
anything having to clear the flag.

### Per-cluster actions float over the row, they are not a menu

`ClusterMenu` (right-click on an avatar → settings / connect / disconnect / copy context) is
gone: a `DropdownMenu` nested inside a `DropdownMenu.Item` is not workable, because the inner
content portals to `body`, the outer content reads that as an interaction outside itself and
closes, which unmounts the inner one.

So Disconnect and Cluster settings are icon buttons absolutely positioned over the row's right
edge, revealed on `group-hover`/`focus-within`. In the flex flow they would shorten every
cluster name to reserve space for a control that is usually invisible; `hidden` instead of
`opacity-0` would drop them out of the tab order. They are siblings of the row button rather
than children because a button cannot nest a button — which is also what keeps the row itself
keyboard-activatable. "Copy context name" moved into the settings dialog, where every detail
value is now a copy button.

`CommandPalette` gained a Clusters group so Ctrl+K — already the "jump to anything" surface —
switches clusters too.

### The link action flips by phase, because the row click cannot reconnect

Disconnecting the *active* cluster left no way back: clicking its row toggles the fold, and
only a non-active row runs `activate`. So the first action is one slot whose icon, label and
handler come from the phase — Disconnect / Cancel connecting / Connect / Retry connection.

`cluster.store` split `connect` out of `activate`, which is now "select, then connect". The
button calls `connect`, so bringing a background cluster up does not steal the tree from the
one being browsed.

Both actions carry a real `Tooltip` rather than a native `title`: the buttons only appear on
hover, and waiting out the browser's own ~1s title delay after already hovering to reveal them
is long enough that the icons read as unlabelled.

### Fixture mode has to fake `connect`, not just `disconnect`

`disconnect` patches the phase whether or not the bridge is there, so in the browser preview a
cluster could be taken down and never brought back — the new Connect button would have been
dead exactly where the UI is meant to be exercised. `connect` now mirrors it and restores the
phase plus the version from `FIXTURE_CLUSTERS`.

The row shows a version only while `phase === 'connected'`. That is what lets fixtures carry a
version for every context without a disconnected row advertising one, and it is also true of
live clusters: the version came from a connection that is now gone.

### Filtering the nav tree force-expands its sections

`Sidebar` filters `NAV_SECTIONS` by label, but a section's open state came only from
`nav.store`, so typing `secret` matched Secrets and then rendered a collapsed `Config` header
with nothing under it. `Section` takes `forceOpen` while a query is active and leaves the
stored expansion untouched, so clearing the filter restores what the user had open.

## Testing

`internal/kube/resource` is covered by `k8s.io/client-go/dynamic/fake`, which drives a
real dynamic informer with no API server. Never point tests — or manual runs — at the
maintainer's kubeconfig contexts without explicit permission.
