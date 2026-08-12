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

## Testing

`internal/kube/resource` is covered by `k8s.io/client-go/dynamic/fake`, which drives a
real dynamic informer with no API server. Never point tests — or manual runs — at the
maintainer's kubeconfig contexts without explicit permission.
