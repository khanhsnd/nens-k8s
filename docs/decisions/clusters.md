# Clusters

The cluster tree, switching between contexts, and what a rename is.

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

So Disconnect, Reload API resources and Cluster settings are icon buttons absolutely
positioned over the row's right edge, revealed on `group-hover`/`focus-within`. In the flex
flow they would shorten every cluster name to reserve space for a control that is usually
invisible; `hidden` instead of `opacity-0` would drop them out of the tab order. They are
siblings of the row button rather than children because a button cannot nest a button — which
is also what keeps the row itself keyboard-activatable. "Copy context name" moved into the
settings dialog, where every detail value is now a copy button.

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

`NavTree` filters the sections by label, but a section's open state came only from
`nav.store`, so typing `secret` matched Secrets and then rendered a collapsed `Config` header
with nothing under it. `Section` takes `forceOpen` while a query is active and leaves the
stored expansion untouched, so clearing the filter restores what the user had open.

A section whose *own* label matches keeps all of its children, which is what makes typing an
API group (`cert-manager.io`) list its kinds.
