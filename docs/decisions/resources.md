# Resources

Live tables: subscriptions, informers, the frontend cache, and what a kind is.

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

Since discovery landed, that entry declares the *fallback* version and scope and may omit
`columns` entirely — `features/resources/catalog.ts` overlays what the cluster serves and
falls back to generic columns. See [discovery.md](discovery.md).

### The namespace filter shows its selection outside the menu

The trigger says "2 namespaces"; the chips beside it say *which* two, and each chip's × drops
that one. Removing a namespace through the menu means opening it, finding the row among
hundreds and reading a checkbox to know what it currently is — the chip is the same action on
the thing being removed. The menu stays the only way to *add* one, because that is a search
over a list the toolbar has no room for.

### Bulk delete is per object, and it is the view that owns it

`DataGrid`'s tick boxes are only a selection (see [grid.md](grid.md)); `ResourceTable` turns
them into `BulkDeleteDialog`, which deletes one object per request — the API has no batch
delete. Failures are therefore per object: the dialog stays open listing exactly which names
failed and why, while the ones that succeeded stay gone and drop out of the selection. A single
"delete failed" for a partial run would leave the user guessing which half of it happened.

The dialog names every object it is about to delete (the first 12, then a count). A confirm
that says only "delete 37 pods?" is not a confirmation of anything the user can check.

### The namespace filter is per cluster, so a cluster-scoped kind must ignore it

`useNamespaceFilter` is keyed by cluster, not by table — "which namespaces am I working in" is a
property of the cluster. `ResourceTable` therefore has to ask whether the kind it is drawing is
namespaced at all: a Node has no `metadata.namespace`, so matching it against the chosen set
matched nothing and the table went empty. The filter control is hidden for those kinds, which is
what made it unexplainable — an invisible filter emptying the table reads as "the informer is
broken", and the way out (open Pods, untick) is not discoverable from the Nodes tab.
