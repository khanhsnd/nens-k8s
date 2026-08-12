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

## Testing

`internal/kube/resource` is covered by `k8s.io/client-go/dynamic/fake`, which drives a
real dynamic informer with no API server. Never point tests — or manual runs — at the
maintainer's kubeconfig contexts without explicit permission.
