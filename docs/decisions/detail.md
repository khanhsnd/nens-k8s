# Detail drawer

One object's reads, writes, owners and events.

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

### Creating is the same apply, and a template is data

A forced server-side apply creates what is not there yet, so the New button on a table needs no
new binding and no `Create` on the port: `CreateDialog` parses the document, builds a
`ResourceRef` from the table's GVR plus the document's name and namespace, and calls the same
`Apply` the YAML tab does. The row then arrives from the informer that is already watching —
nothing refreshes anything.

The endpoint comes from the table, not from the document, so a pasted object of another kind
would be applied to the wrong resource. The dialog rejects that mismatch itself, because the API
server's answer for it ("no kind Service is registered…") reads like a bug in Nens.

`templates.ts` follows the same rule as columns: the head (`apiVersion`, `kind`, `metadata`) is
computed from the GVR and the scope discovery served, and only the body below it is per-kind
data. A kind with no entry — every custom resource — still gets a valid head to fill in, which
is why the button only needs discovery to have named the Kind. It is also gated on the `create`
verb discovery reported, which is what the *resource* supports, not what this user is allowed
to do: RBAC is only ever answered by trying, and a Forbidden lands in the dialog.

### The dirty guard is a store, not a prop

`features/resources/editor.store.ts` holds `dirty` plus one `pending` action. Anything that would
throw the buffer away — the drawer's close button, its tab strip, selecting another row in
`AppShell` — calls `guard(action)`, and `DiscardGuard` renders the confirmation when a pending
action exists. Threading a callback down instead would have stopped at the drawer, and row selection
lives two components above it. Closing the app tab is deliberately not guarded: the tab is the
subscription's owner, and blocking it would mean blocking cluster switches too.
