# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nens — a Wails v2 desktop Kubernetes client. Go backend (`main.go` + `internal/`), React 19 + Vite + Tailwind v4 frontend (`frontend/`). The frontend is embedded into the binary via `//go:embed all:frontend/dist`.

`docs/ROADMAP.md` is the authoritative plan: phases 1–9 (shell, live resources, YAML, logs, exec + port-forward, discovery + CRDs, metrics + overview, Helm, production hardening) are done — code signing is the one item left, and it needs a certificate rather than code. Read it before adding a feature — it already specifies the intended package layout and API shape for each phase.

## Docs

- `docs/ROADMAP.md` — what to build next, and the exit criteria per phase. Mark a phase done there when it lands.
- `docs/decisions/` — **why** the code looks the way it does, one file per feature area (`README.md` is the index). When a change turns on something non-obvious — a race, an ordering guarantee, a rejected alternative — append an entry to the matching file instead of leaving it to be re-derived from the diff. Read the relevant file before reworking anything it covers, and start a new one rather than letting any of them grow into a dumping ground.

## Safety

Never connect to, list, or otherwise touch the maintainer's real kubeconfig contexts without explicit permission for that session. Verify with fixtures (browser dev server) and with `client-go`'s fake dynamic client instead.

## Commands

```bash
wails dev
```

```bash
wails build
```

```bash
pnpm --dir frontend typecheck
```

```bash
go build ./...
```

```bash
go test ./internal/...
```

`wails dev` runs the Go app with the Vite dev server (auto-detected port) and regenerates `frontend/wailsjs/` bindings on every rebuild. `wails generate module` regenerates the bindings alone — no window, no cluster access — use it after changing an API struct. To drive only the browser UI, `pnpm --dir frontend dev --port 5173 --strictPort` (this is what `.claude/launch.json` starts) — the Wails bridge is absent there, so stores fall back to fixtures.

`go test ./internal/...` covers the adapters against fakes — the root package is excluded because its `//go:embed all:frontend/dist` cannot load before the frontend is built — a fake dynamic client for `internal/kube/resource`, an `httptest` API server for `internal/kube/cluster` and `internal/update`, temp dirs for `internal/kube/kubeconfig` and `internal/config` (`t.Setenv` keeps the real `~/.kube/config` and `%AppData%` out of them). See `docs/decisions/testing.md`. There are no frontend tests.

`NENS_LOG_LEVEL=debug` raises both slog and Wails' own logger; the log is `%AppData%/Nens/nens.log`.

## Architecture rules

These are load-bearing — `docs/ROADMAP.md` states them and the code follows them:

- `internal/domain` — entities and **port interfaces only**. Imports no Wails and no infra beyond `k8s.io/client-go/rest`.
- `internal/kube/*` — adapters implementing those ports (`kubeconfig.Loader` → `KubeconfigSource` + `KubeconfigFiles`, `cluster.Registry` → `ClusterRegistry`, `resource.Store` → `ResourceSubscriber`, `discovery.Cache` → `APIDiscovery`, `metrics.Reader` → `MetricsSampler`, `pods.Resolver` → `ContainerResolver`, `logs.Streamer` → `LogStreamer`, `exec.Runner` → `ExecRunner`, `forward.Registry` → `PortForwarder`, `helm.Client` → `HelmClient`). `internal/config` is the settings adapter (`SettingsStore`), `internal/update` the release feed (`Updater`).
- `internal/logging` is the one infrastructure package with no port: it configures `slog.Default()` and bridges Wails' logger into it, and everything else calls `slog` directly — see `decisions/logging.md`.
- `internal/app/*` — the Wails binding surface only, no logic. One struct per bounded API (`ClusterAPI`, `KubeconfigAPI`, `ResourceAPI`), registered in `App.Bindings()`.
- `internal/event` — the only package allowed to touch `runtime.EventsEmit`. Everything else publishes through `domain.Publisher`. Other Wails runtime calls (native dialogs) belong in `internal/app`, which is the Wails edge — never deeper.
- Frontend mirrors it: `features/*` own state + views, `shared/*` is generic, `app/layout` is composition only.
- A new resource kind should be **data** (a table/column spec), not a new component.

## Backend flow

`main.go` → `logging.Setup(config.Dir())` → `app.New(version())` wires `event.Bus` → `cluster.NewRegistry(kubeconfig.NewLoader(), bus)` → `NewClusterAPI(registry)`. `App.Startup` binds the Wails context into both the bus and each API struct; the context is what makes `Publish` able to emit.

The version is read from the embedded `wails.json` (`info.productVersion`) — the same field the exe resources and the installer use, and the release workflow stamps it from the tag. Never add a second place to write it; `decisions/packaging.md` explains why.

`cluster.Registry` holds `map[id]*Connection` and is the connection lifecycle owner. `Connect` publishes `cluster:changed` at `connecting`, then `connected` or `error` — the frontend learns state from events, not from the call's return value alone. `cluster.Dial` builds clientset, dynamic client, memory-cached discovery and a deferred REST mapper per cluster; `Close` only cancels the connection context, which is what stops everything hanging off it — the informers of `resource.Store` and the API surface cached by `discovery.Cache` both hang off it and die with it.

Cluster identity is the **kubeconfig context name** (`Cluster.ID == Context`), not the server URL.

Clusters come from `clientcmd`'s default loading rules **plus** the paths in `config.Store` (`%AppData%/Nens/settings.json`). `KubeconfigAPI` adds to that list: `Add` references a file where it is, `Import` writes pasted YAML to `%AppData%/Nens/kubeconfigs/` first. `Loader.rules()` is rebuilt per call, so a newly added file shows up on the next `List()`.

`resource.Store` owns every informer: one per (cluster, GVR, namespace), created on first subscribe, ref-counted by token, cancelled when the last token leaves. Its context derives from the connection's, so disconnecting a cluster stops its informers. A `watch` coalesces handler callbacks into a `map[uid]delta` and flushes one `resource:event` batch per 100ms to each of its tokens; `reset: true` means "replace the frontend cache". The frontend supplies the subscription token — `docs/decisions/resources.md` explains why, and why the snapshot must be an event rather than the call's return value.

## Frontend conventions

- Path aliases: `@/*` → `src/*`, `@bindings/*` → `wailsjs/*` (declared in both `tsconfig.json` and `vite.config.ts` — change both).
- A crash is reported, not swallowed: `shared/ui/ErrorBoundary.tsx` wraps the app and `shared/lib/report.ts` also listens for `error`/`unhandledrejection`, both routing through the runtime's `LogError` into `nens.log`. Anything that catches an exception and shows nothing belongs in that pattern instead.
- A failure the user is *shown* is `shared/ui/ErrorText.tsx`, never a bare `<p className="text-danger">`: the app sets `user-select: none`, so a message nobody can select or copy is a message nobody can paste into a bug report.
- `frontend/wailsjs/` is **generated by Wails**. Never hand-edit it; regenerate by running `wails dev`/`wails build`.
- Stores are zustand. Every store that calls a binding must degrade when the bridge is missing: wrap the call in `try/catch` and fall back to fixtures with an `offline` flag (see `cluster.store.ts`). `EventsOn` subscriptions need the same guard. `cluster.store.ts` owns that flag — other stores read `useClusters.getState().offline` rather than deciding for themselves.
- Tailwind v4 with a semantic `@theme` palette in `src/styles/global.css` (`base`/`surface`/`raised`/`overlay`/`line`, `text`/`muted`/`faint`, `accent`, `ok`/`warn`/`danger`/`info`). Use those tokens — no raw hex, no default Tailwind grays.
- Every list view is virtualized with `@tanstack/react-virtual`. `shared/ui/DataGrid.tsx` is the one implementation: fixed row height, grid template derived from a `Column[]` spec, header scroll synced to the body, Excel-style cell/range selection (`shared/ui/grid.selection.ts`). A kind-specific table is a `Column[]` file (`features/resources/pod.columns.tsx`) passed to it, never a new grid. Row height is fixed at 30px and cells centre with flexbox: a `cell` renderer must size itself (use `shared/ui/Badge.tsx`'s `Pill` for chips) and never rely on the cell's typography, or it will grow past the row — measure it against the row before calling it done.
- Creating an object is the drawer's server-side apply with a ref built from the document — no separate binding. The table's New button appears when discovery named the Kind and reported the `create` verb; its starting YAML comes from `features/resources/templates.ts`, where the head is computed from the GVR and only the body is per-kind data.
- A resource kind is **data**: `features/resources/kinds.ts` maps a nav leaf id to `{ gvr, namespaced, columns? }`. Adding a kind is one `*.columns.tsx` file plus one entry — the table, the filter and the drawer's Overview all read the same `Column[]`. `columns` is optional: a kind without one gets `generic.columns.ts` (Name / Namespace / printer columns / Age). `features/resources/catalog.ts` is the only place that turns a spec into a usable `Kind` — it overlays the version and scope the cluster actually serves and mints a kind per custom resource, so never read `KINDS` directly to resolve a leaf.
- `resource.store.ts` holds `Map<uid, object>` per subscription and applies incoming batches once per animation frame. `AppShell` reconciles subscriptions from `open tabs × active cluster`, so switching tabs never restarts an informer.
- Open views are tabs (`features/tabs/tab.store.ts`); the sidebar and command palette open/focus a tab, they do not hold the current selection.
- Anything you watch rather than read — logs and shells — is a **dock tool** (`features/dock`), not a drawer tab. The drawer is for one object's static detail. Add a `DockTool.kind`, never a second panel.
- "Which containers can I attach to" is answered once, by `features/containers` over `ContainerAPI.Targets`. Logs and terminal both read it; neither imports the other.
- Port Forwarding has no GVR, so it is not a kind: `AppShell` renders `features/portforward` from the leaf id, and its rows go through the same `DataGrid` with a `Column<PortForward>[]` spec. The Overview is the same shape — `features/overview` from the leaf id — except that it reads three slices, so `AppShell` expands its tab into `OVERVIEW_KINDS` and deduplicates before subscribing.
- A Helm release has no GVR either, so `features/helm` is a view like Port Forwarding: `AppShell` renders it from the leaf id, it owns its fetch and its own drawer, and nothing watches — `helm.store.ts` reads on open, on cluster change, after its own writes and on Refresh. Its adapter is the one port with no `context.Context` — see `decisions/helm.md`.
- `features/topology` is the third view of that shape — `AppShell` renders it from the leaf id and expands its tab into `TOPOLOGY_KINDS`. It draws the informer caches as a graph (layers as columns, namespaces as lanes) and adds no binding: `replicasets` is subscribed only so a pod can reach its Deployment, pods fold into their workload until asked for, and placement edges are drawn only for what is hovered. Selecting a card opens the ordinary drawer, which is why `AppShell`'s selection carries its own kind — see `decisions/topology.md`.
- `features/updates` is a section of the settings dialog rather than a view, and it never polls: it checks when the dialog opens and when the user asks. A build that reports `dev` — which is what the browser preview looks like — makes no network call at all. `canInstall` comes from the backend (`runtime.GOOS`), so the view never branches on the platform itself: Windows offers **Install and restart**, macOS and Linux offer the release page.
- `metrics.k8s.io` cannot be watched, so `features/metrics` polls it every 30s and only while something on screen shows usage. Usage is attached to a row on its way to the table (`usage.ts`), never merged into the informer cache — see `decisions/metrics.md`.
- Panels resize through `shared/ui/Resizer.tsx` and remember their size in `shared/ui/panel.size.ts`. Never hand-roll a drag handle.
- Sidebar tree is `features/navigation/nav.tree.ts`: the curated sections of `nav.model.ts` filtered to what the connected cluster serves, plus one section per custom API group. `features/discovery` owns the served API surface, loaded once per connection like the forward registry's restore.

## Performance budget

Enforce as the app grows (from the roadmap):

- Informer cache is the single source of truth — never re-`List` to refresh a table.
- Every list view is virtualized. No exceptions.
- Coalesce backend resource events (~100ms) and frontend event handling (per animation frame) — a 5k-pod resync must be one update, not 5k.
- Watch only the namespaces in view when a cluster has >5k pods.
- Trim managed fields off objects before sending them to the frontend.
