# Port forwarding

The forward registry, the view over it, and what is remembered.

### A forward carries its own id, so it needs no client-supplied token

Resource subscriptions and log streams take a frontend token because their first event races the
call's return (see [resources.md](resources.md)). A `PortForward` event carries the whole record, id
included, so a store keyed by id can apply an event that arrives before `Start` resolves. `Start`
still returns the `starting` record, and `forward:changed` reports every transition after it.

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

### A port forward is remembered until it is stopped by hand

`config.Store` keeps a `[]domain.ForwardSpec`. `Registry.Start` remembers the spec, and `activate`
overwrites it with the local port the kernel actually picked — a restored forward has to answer on
the address the user copied, so remembering the requested `0` would be useless. `Stop` is the only
path that forgets: a forward that died with its cluster, or with the app, is one the user still
wants. `untilDisconnected` therefore calls `finish` directly instead of going through `Stop`.

`Restore(clusterID)` starts every remembered spec of that cluster that is not already up, and the
frontend calls it when a cluster reaches `connected` — `useForwards.sync(connected)` mirrors
`resource.store.sync`, once per connection, so a reconnect brings the forwards back and a render
does not. The registry cannot drive that itself: it has no hook into `Connect`, and having
`cluster.store` call the forward store would close an import cycle through `portforward.api`.

Restoring is exercised by the fake dynamic client only. Like the rest of phase 5, it has never run
against a real API server.
