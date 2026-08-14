# Nens — build plan

## Architecture rules

- `internal/domain` holds entities and port interfaces. It imports no Wails and no infra beyond `k8s.io/client-go/rest`.
- `internal/kube/*` are adapters implementing those ports.
- `internal/app/*` is the binding surface only — no logic, one struct per bounded API.
- `internal/event` is the only place that touches the Wails runtime.
- Frontend mirrors the same split: `features/*` own state + views, `shared/*` is generic, `app/layout` is composition only.
- Every new resource kind is data (a table spec), not a new component.

## Phase 1 — Shell (done)

Layout, cluster rail, resizable nav tree, virtualized table, detail drawer, command palette, status bar.
Go: kubeconfig loader, cluster registry, connection lifecycle, event bus.
Table renders fixture data; falls back to fixtures when the Wails bridge is absent.

## Phase 2 — Live resources (done)

- `internal/kube/resource`: dynamic informer per (cluster, GVR, namespace), started lazily on first subscribe, ref-counted, stopped when the last subscriber leaves.
- `ResourceAPI.Subscribe(token, clusterID, gvr, namespace)` / `Unsubscribe(token)` — the frontend supplies the token, see `decisions/resources.md`.
- Informer handlers publish `resource:event` with a coalescing window (~100ms) so a 5k-pod resync is one frontend update, not 5k.
- Frontend `features/resources/resource.store.ts`: `Map<uid, object>` per subscription, applied once per animation frame.
- `features/resources/kinds.ts` is the columns registry: `{ gvr, namespaced, columns }` per kind.

Exit: Pods, Deployments, Nodes, Services, ConfigMaps live. Verified against fixtures and
`client-go`'s fake dynamic client; not yet run against a real cluster.

## Phase 3 — Detail + YAML (done)

- `internal/kube/resource.Editor`: `Get` / `Apply` (forced server-side apply, field manager `nens`) /
  `Delete` / `Scale` (the `scale` subresource) / `Owners` / `Events`, all on `domain.ResourceRef`.
- `ResourceAPI` exposes them; `domain.ResourceEditor` is the port.
- CodeMirror 6 + YAML mode in the drawer's YAML tab (`shared/ui/CodeEditor.tsx`), Ctrl+S applies,
  dirty-state guard on drawer close / drawer tab switch / row selection.
- Owner-reference chain in Overview (pod → replicaset → deployment).
- Events tab filtered by `involvedObject.uid`, newest first.
- Delete and Scale live in the drawer header menu.
- Creating is the same forced apply: the table's New button opens a YAML template built from
  the GVR plus a per-kind body (`templates.ts`), and the informer delivers the new row. Shown
  only when discovery named the Kind and reported the `create` verb.

Exit: verified against fixtures (browser dev server) and the fake dynamic client. The write paths
(`Apply`, `Delete`, `Scale`) have never run against a real API server.

## Phase 4 — Logs (done)

- `internal/kube/logs.Streamer`: one goroutine per token reading `GetLogs(...).Stream(ctx)`, lines
  coalesced into one `log:chunk` event per 100ms, drop-oldest past 5k buffered lines.
- `LogAPI.Targets(ref)` resolves a pod, a workload's LabelSelector or a service's selector into
  `{pod, container, role, state, restarts}`; `Start(token, clusterID, target, opts)` / `Stop(token)`.
- `features/logs`: virtualized line list on `@tanstack/react-virtual`, `LogBuffer` scrollback capped at
  10k/50k/200k lines outside React, incremental search index, filter-to-matches, regex + case toggles,
  match stepping, follow-tail, wrap, timestamps, previous container, tail/since, multi-container merge,
  copy, download.
- `features/dock`: the bottom panel that hosts them — its own tab strip, one tab per streaming target,
  maximise, resizable. Phase 5's shell plugs in as a second `DockTool.kind`.
- `shared/ui/Resizer.tsx` + `panel.size.ts`: every panel (sidebar, drawer, dock) drags the same way and
  remembers its size.

Exit: verified against fixtures (browser dev server) and the fake clientset + fake dynamic client.
`GetLogs` has never run against a real API server. Streaming the logs of a *workload* (deployment →
all its pods) is wired end to end but only exercised by fixtures.

## Phase 5 — Exec + port-forward (done)

- `internal/kube/pods`: container resolution moved out of `logs` — one `ContainerAPI.Targets(ref)`
  serves both the Logs and the Shell panel, and `domain.LogTarget` became `domain.ContainerTarget`.
- `internal/kube/exec.Runner`: `remotecommand.NewSPDYExecutor` per session, stdout batched into one
  `exec:data` event per 16ms (base64), keystrokes written through an `io.Pipe`, resize through a
  latest-wins `TerminalSizeQueue`. `ExecAPI.Start` / `NodeShell` / `Send` / `Resize` / `Stop`.
- Node shell: `NodeShell` creates a privileged `hostPID` pod on the node, waits for Running, attaches
  `nsenter --target 1`, and deletes the pod when the session ends — one call owns that lifetime.
- `internal/kube/forward.Registry`: `portforward.New` per forward, `forward:changed` on every state
  change, local port 0 resolved from `GetPorts()` once ready, a forward dies with its cluster
  connection. `PortForwardAPI.Ports` / `Start` / `List` / `Stop`.
- `features/terminal`: xterm.js + fit addon as a second `DockTool.kind`, container and shell pickers,
  reconnect, theme-aware palette. `features/portforward`: the Network → Port Forwarding view over the
  same `DataGrid`, a per-port panel in the drawer's Overview, and a `Forwarded` column on Services.

Exit: verified against fixtures (browser dev server), the fake clientset and the fake dynamic client.
`remotecommand` and `portforward` have never run against a real API server; the node shell has never
created a real pod. xterm rendering could not be verified in the headless browser pane (it never
composites, so `requestAnimationFrame` never fires) — the data path was verified module by module.

## Phase 6 — Discovery + CRDs (done)

- `internal/kube/discovery.Cache`: `ServerPreferredResources` plus the CRDs' `additionalPrinterColumns`,
  built once per cluster connection and evicted with it. `DiscoveryAPI.Resources` / `Refresh`.
  Subresources and anything that cannot be listed *and* watched are filtered out; a partial answer
  (one dead aggregated API) is kept rather than discarded.
- `domain.APIResource.Custom` is derived from the API group, not from the CRD list, so the tree needs
  no permission on `customresourcedefinitions` — the printer columns are a separate best effort.
- `features/discovery` mirrors it on the frontend; `features/resources/catalog.ts` folds it over
  `kinds.ts`, taking the served version and scope from the cluster and falling back to generic
  columns (`generic.columns.ts` + `shared/lib/jsonpath.ts`) for any kind with no columns file.
- `features/navigation/nav.tree.ts` filters the curated sections to what the cluster serves and
  appends one section per custom API group. `nav.model.ts` stays the curated catalog — see
  `decisions/discovery.md` for why the tree is not generated wholesale.
- Every built-in nav leaf now has a GVR, so Secrets, Jobs, Ingresses and the rest open a real table
  instead of "not wired up yet". Only Pods, Deployments, Nodes, Services, ConfigMaps and CRDs have
  hand-written columns; the others are generic until someone needs more.

Exit: verified against fixtures (browser dev server) and a scripted discovery interface + the fake
dynamic client. `ServerPreferredResources` has never run against a real API server.

## Phase 7 — Metrics + overview (done)

- `internal/kube/metrics.Reader`: stateless `Sample(clusterID)` over `metrics.k8s.io/v1beta1`
  through the dynamic client — no new dependency — returning millicores and bytes per node and
  per pod, a pod's usage being the sum of its containers'. `MetricsAPI.Sample`.
- Not watchable, so nothing is pushed: `features/metrics/metrics.store.ts` owns the 30s poll and
  `AppShell` only runs it while the open tab is the Overview or a kind that declares `metrics`.
- `features/metrics/usage.ts` attaches a sample to a row on the way to the table, so the informer
  cache stays the server's truth and CPU/Memory are ordinary columns on Pods and Nodes (Nodes
  showing the share of `status.allocatable`, parsed by `shared/lib/quantity.ts`).
- `features/overview`: CPU, memory and pod-capacity donuts, nodes ready, pod phases as one
  stacked bar, and the 25 most recent warning events. It is a view rather than a kind, so
  `AppShell` expands its tab into three subscriptions (nodes, pods, events) and deduplicates.
- A cluster with no metrics-server is an answer rather than an error: `Available: false` plus a
  reason, donuts and cells render `—`, and everything that does not need metrics still works.

Exit: verified against fixtures (browser dev server) and the fake dynamic client, including the
unavailable path. `metrics.k8s.io` has never been listed against a real API server. Screenshots
were again impossible in the headless browser pane, so the layout was verified through the DOM
and computed styles in both themes.

## Phase 8 — Helm (done)

- `internal/kube/helm.Client`: `helm.sh/helm/v3/pkg/action` for list/get/history/rollback/
  uninstall, over an `action.Configuration` built per call from the cluster connection —
  helm's `RESTClientGetter` is the connection, and the Secret storage driver is the
  connection's own clientset. `HelmAPI.Releases` / `History` / `Detail` / `Rollback` /
  `Uninstall`. `domain.HelmClient` is the only port with no `context.Context`, because
  helm's action API takes none.
- A release is not a kind — no GVR, no UID, no informer — so `AppShell` renders
  `features/helm` from the leaf id and the view owns its fetch and its drawer, like Port
  Forwarding. Nothing watches: `helm.store.ts` reads on open, on cluster change, after its
  own writes and on Refresh.
- The drawer is Overview / Values / Manifest / Notes / History; History lists every revision
  with rollback and compare, and the compare view diffs any two revisions' values *or*
  manifest — a release on the chart's defaults has no values to diff, so both are offered.
- `shared/lib/diff.ts` + `shared/ui/DiffView.tsx`: common head and tail matched first, LCS
  over what is left, unified rendering because the drawer is too narrow for two panes.
  Above two million cells it stops aligning and says so.
- The "Charts" nav leaf was removed: repositories and install are their own feature, and a
  leaf that opens "not wired up yet" is worse than no leaf.

Exit: verified against fixtures (browser dev server) — list, drawer tabs, history, values
and manifest diffs, rollback and uninstall — and against `client-go`'s fake clientset seeded
through helm's own storage driver. `Rollback` and `Uninstall` have never run against a real
API server; both go through helm's kube client, which a fake cannot stand in for.

## Phase 9 — Production hardening (done, except signing)

- Settings persistence (`internal/config`, JSON under `os.UserConfigDir`): `config.Store` persists the
  kubeconfig source list, per-cluster display names and the port forwards to restore on connect. UI
  preferences (theme, appearance, panel sizes, grid layouts, namespace filter, open tabs, last cluster)
  live in `localStorage` through `shared/lib/persist.ts` — see `decisions/settings.md` for which side
  owns what.
- Appearance: `SettingsAPI` (`Fonts`/`Dir`/`Reveal`) plus `features/settings` — installed-font picker
  for the UI and monospace families, and a text size that scales the whole type scale off one CSS
  variable.
- `internal/logging`: `log/slog` into `%AppData%/Nens/nens.log` beside `settings.json`, size-checked on
  every write and rolled at 4 MiB with one previous file kept. Wails' own logger is bridged into it, so
  the webview and the frontend's `ErrorBoundary` land in the same file. Adapters log lifecycle,
  sessions and every write (apply/delete/scale, helm rollback/uninstall) — never per resource event.
  See `decisions/logging.md`.
- Tests: `cluster.Registry` over an `httptest` `/version` server, `resource.Store`'s informer
  ref-counting, the coalescer's window and broadcast, `config.Store`'s round trip, and the update feed.
- `internal/update` + `UpdateAPI`: the repository's `releases/latest`, a three-integer version
  comparison, a SHA-256 check against the published `checksums.txt`, and the NSIS installer started
  through the shell so it can elevate. Nothing polls; the check is Settings → Updates. `wails.json`'s
  `info.productVersion` is the one place a version is written, embedded by `main.go` and stamped from
  the tag by `.github/workflows/release.yml`. See `decisions/packaging.md`.
- Three platforms out of one tag: the release workflow builds the Windows NSIS installer, a universal
  macOS `.app` zip and a Linux x64 tarball (WebKit2GTK 4.0), publishes them under one `checksums.txt`,
  and rewrites the Homebrew Cask in `khanhsnd/homebrew-tap` from the macOS asset. Only the Windows
  build installs its own update — `UpdateStatus.CanInstall` is `runtime.GOOS == "windows"`, and the
  other two open the release page instead.
- **Not done: code signing.** There is no certificate, so SmartScreen warns on a downloaded installer.
  `decisions/packaging.md` names the exact `signtool` step and where it plugs into `project.nsi`.

Exit: verified with `go test ./...`, the browser dev server (settings dialog, update section in both
states, the error boundary and its fallback in both themes) and `wails generate module`, which runs the
real binary — `nens.log` shows the startup, the webview bridge and a real connect. Never exercised: an
actual GitHub release (none published yet), `startInstaller`, and the NSIS build itself, which needs
`makensis` on PATH.

## Phase 10 — Topology (done)

- `features/topology`: a graph of the cluster built from the informer caches alone —
  Ingress → Service → Workload → Pod → Node as columns, one namespace per lane, ordered
  by barycentre sweeps. No new backend, no new dependency, no new fetch.
- A view rather than a kind, like the Overview and Helm: `AppShell` renders it from the
  leaf id and expands its tab into `TOPOLOGY_KINDS`. `replicasets` is subscribed but never
  drawn — it is how a pod reaches its Deployment.
- Pods fold into their workload until asked for; placement edges are drawn only for what
  is hovered or selected; a Service edge lands on the workload whose pod template its
  selector matches. Past `MAX_NODES` the view asks for a namespace instead of drawing.
- Clicking any card opens the same detail drawer, so `AppShell`'s selection carries its
  own kind rather than borrowing the open tab's. See `decisions/topology.md`.

Exit: verified against fixtures (browser dev server) — layout with no overlaps, expand and
collapse, namespace scoping, search highlighting, hover focus with placement counts, the
drawer opening on a Node from the graph and on a Pod from the table, and both themes
through computed styles. Screenshots remain impossible in the headless browser pane. The
graph has never been built from a real cluster's caches.

## Performance budget

Enforce these as the app grows:

- Informer cache is the single source of truth — never re-`List` to refresh a table.
- Every list view is virtualized. No exceptions.
- Frontend event handling coalesces per animation frame.
- Watch only the namespaces in view when the cluster has >5k pods.
- Trim managed fields off objects before sending them to the frontend.
