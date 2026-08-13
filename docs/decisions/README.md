# Decisions

Why the code looks the way it does. One file per feature area — append to the file
the change belongs to whenever a choice is not obvious from reading the code,
especially when the obvious alternative is wrong.

| File | Covers |
| --- | --- |
| [clusters.md](clusters.md) | The cluster tree, switching, connect/disconnect, renaming |
| [kubeconfig.md](kubeconfig.md) | Adding, importing and removing kubeconfig files |
| [discovery.md](discovery.md) | The served API surface, the tree built from it, custom resources |
| [resources.md](resources.md) | Subscriptions, informers, the frontend cache, what a kind is |
| [detail.md](detail.md) | The drawer: reads, server-side apply, scale, events, the dirty guard |
| [metrics.md](metrics.md) | Sampling metrics.k8s.io, usage on a row, the cluster Overview |
| [topology.md](topology.md) | The cluster graph: layers, lanes, which edges are drawn when |
| [grid.md](grid.md) | `DataGrid`: selection, row actions, column layout, cell sizing |
| [panels.md](panels.md) | The dock, the drawer and one resizer for all of them |
| [logs.md](logs.md) | Log streaming, the scrollback buffer, search, backpressure |
| [terminal.md](terminal.md) | Exec sessions, xterm, the node shell |
| [portforward.md](portforward.md) | The forward registry, its view and its persistence |
| [helm.md](helm.md) | Releases, revisions, the values diff, rollback and uninstall |
| [settings.md](settings.md) | What is stored where, appearance, fonts, remembered state |
| [logging.md](logging.md) | `nens.log`: what is written, where it rolls, what is never in it |
| [packaging.md](packaging.md) | The version's one source, the installer, updates, signing |
| [testing.md](testing.md) | What the tests run against, and what they must never touch |
