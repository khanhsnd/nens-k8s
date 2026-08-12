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
- `ResourceAPI.Subscribe(token, clusterID, gvr, namespace)` / `Unsubscribe(token)` — the frontend supplies the token, see `DECISIONS.md`.
- Informer handlers publish `resource:event` with a coalescing window (~100ms) so a 5k-pod resync is one frontend update, not 5k.
- Frontend `features/resources/resource.store.ts`: `Map<uid, object>` per subscription, applied once per animation frame.
- `features/resources/kinds.ts` is the columns registry: `{ gvr, namespaced, columns }` per kind.

Exit: Pods, Deployments, Nodes, Services, ConfigMaps live. Verified against fixtures and
`client-go`'s fake dynamic client; not yet run against a real cluster.

## Phase 3 — Detail + YAML

- `ResourceAPI.Get` / `Apply` (server-side apply via `dynamic`) / `Delete` / `Scale`.
- CodeMirror 6 + YAML mode in the drawer's YAML tab, dirty-state guard, apply on save.
- Owner-reference graph in Overview (pod → replicaset → deployment).
- Related events list filtered by `involvedObject.uid`.

## Phase 4 — Logs

- `LogAPI.Stream(ref, container, opts)` → goroutine reading `GetLogs(...).Stream(ctx)`, chunked to `log:<token>` events.
- Frontend: xterm.js with `@xterm/addon-fit` + search addon, follow-tail toggle, container picker, download.
- Backpressure: bounded channel, drop-oldest with a visible "lines dropped" marker.

## Phase 5 — Exec + port-forward

- `ExecAPI`: `remotecommand.NewSPDYExecutor`, bidirectional stream bridged to xterm, resize via `TerminalSizeQueue`.
- `PortForwardAPI`: `portforward.New` with a `Registry` of active forwards, surfaced in the Network → Port Forwarding view.
- Node shell (privileged debug pod) reuses the same ExecAPI.

## Phase 6 — Discovery + CRDs

- Cache `discovery.ServerPreferredResources` per cluster; rebuild the sidebar tree from it instead of the static `nav.model.ts`.
- Custom Resources section lists CRDs by group, with generic table columns from `additionalPrinterColumns`.

## Phase 7 — Metrics + overview

- `metrics.k8s.io` client for node/pod CPU + memory, polled at 30s (not watched — the API has no watch).
- Cluster Overview: node capacity donuts, pod phase breakdown, recent warning events.
- Degrade cleanly when metrics-server is absent.

## Phase 8 — Helm

- `helm.sh/helm/v3/pkg/action` for list/get/history/rollback/uninstall.
- Values diff view between revisions.

## Phase 9 — Production hardening

- Settings persistence (`internal/config`, JSON under `os.UserConfigDir`) — **started early**: `config.Store` already persists the kubeconfig source list. Extend it, don't replace it.
- Structured logging with `log/slog`, log file in the same dir.
- Table tests for the registry, informer ref-counting, and the coalescer.
- NSIS installer, code signing, auto-update feed.

## Performance budget

Enforce these as the app grows:

- Informer cache is the single source of truth — never re-`List` to refresh a table.
- Every list view is virtualized. No exceptions.
- Frontend event handling coalesces per animation frame.
- Watch only the namespaces in view when the cluster has >5k pods.
- Trim managed fields off objects before sending them to the frontend.
