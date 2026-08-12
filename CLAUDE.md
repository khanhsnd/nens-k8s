# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Nens — a Wails v2 desktop Kubernetes client. Go backend (`main.go` + `internal/`), React 19 + Vite + Tailwind v4 frontend (`frontend/`). The frontend is embedded into the binary via `//go:embed all:frontend/dist`.

`docs/ROADMAP.md` is the authoritative plan: phases 1–5 (shell, live resources, YAML, logs, exec + port-forward) are done, phases 6+ (CRDs, metrics, Helm, hardening) are not. Read it before adding a feature — it already specifies the intended package layout and API shape for each phase.

## Docs

- `docs/ROADMAP.md` — what to build next, and the exit criteria per phase. Mark a phase done there when it lands.
- `docs/DECISIONS.md` — **why** the code looks the way it does. When a change turns on something non-obvious — a race, an ordering guarantee, a rejected alternative — append an entry instead of leaving it to be re-derived from the diff. Read it before reworking anything it covers.

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
go test ./...
```

`wails dev` runs the Go app with the Vite dev server (auto-detected port) and regenerates `frontend/wailsjs/` bindings on every rebuild. `wails generate module` regenerates the bindings alone — no window, no cluster access — use it after changing an API struct. To drive only the browser UI, `pnpm --dir frontend dev --port 5173 --strictPort` (this is what `.claude/launch.json` starts) — the Wails bridge is absent there, so stores fall back to fixtures.

`go test ./...` covers `internal/kube/resource` (fake dynamic client, no API server) and `internal/kube/kubeconfig` (temp dirs; `t.Setenv("KUBECONFIG", …)` keeps the real `~/.kube/config` out of the test). There are no frontend tests.

## Architecture rules

These are load-bearing — `docs/ROADMAP.md` states them and the code follows them:

- `internal/domain` — entities and **port interfaces only**. Imports no Wails and no infra beyond `k8s.io/client-go/rest`.
- `internal/kube/*` — adapters implementing those ports (`kubeconfig.Loader` → `KubeconfigSource` + `KubeconfigFiles`, `cluster.Registry` → `ClusterRegistry`, `resource.Store` → `ResourceSubscriber`, `pods.Resolver` → `ContainerResolver`, `logs.Streamer` → `LogStreamer`, `exec.Runner` → `ExecRunner`, `forward.Registry` → `PortForwarder`). `internal/config` is the settings adapter (`SettingsStore`).
- `internal/app/*` — the Wails binding surface only, no logic. One struct per bounded API (`ClusterAPI`, `KubeconfigAPI`, `ResourceAPI`), registered in `App.Bindings()`.
- `internal/event` — the only package allowed to touch `runtime.EventsEmit`. Everything else publishes through `domain.Publisher`. Other Wails runtime calls (native dialogs) belong in `internal/app`, which is the Wails edge — never deeper.
- Frontend mirrors it: `features/*` own state + views, `shared/*` is generic, `app/layout` is composition only.
- A new resource kind should be **data** (a table/column spec), not a new component.

## Backend flow

`main.go` → `app.New()` wires `event.Bus` → `cluster.NewRegistry(kubeconfig.NewLoader(), bus)` → `NewClusterAPI(registry)`. `App.Startup` binds the Wails context into both the bus and each API struct; the context is what makes `Publish` able to emit.

`cluster.Registry` holds `map[id]*Connection` and is the connection lifecycle owner. `Connect` publishes `cluster:changed` at `connecting`, then `connected` or `error` — the frontend learns state from events, not from the call's return value alone. `cluster.Dial` builds clientset, dynamic client, memory-cached discovery and a deferred REST mapper per cluster; `Close` only cancels the connection context, which is what stops everything hanging off it.

Cluster identity is the **kubeconfig context name** (`Cluster.ID == Context`), not the server URL.

Clusters come from `clientcmd`'s default loading rules **plus** the paths in `config.Store` (`%AppData%/Nens/settings.json`). `KubeconfigAPI` adds to that list: `Add` references a file where it is, `Import` writes pasted YAML to `%AppData%/Nens/kubeconfigs/` first. `Loader.rules()` is rebuilt per call, so a newly added file shows up on the next `List()`.

`resource.Store` owns every informer: one per (cluster, GVR, namespace), created on first subscribe, ref-counted by token, cancelled when the last token leaves. Its context derives from the connection's, so disconnecting a cluster stops its informers. A `watch` coalesces handler callbacks into a `map[uid]delta` and flushes one `resource:event` batch per 100ms to each of its tokens; `reset: true` means "replace the frontend cache". The frontend supplies the subscription token — `docs/DECISIONS.md` explains why, and why the snapshot must be an event rather than the call's return value.

## Frontend conventions

- Path aliases: `@/*` → `src/*`, `@bindings/*` → `wailsjs/*` (declared in both `tsconfig.json` and `vite.config.ts` — change both).
- `frontend/wailsjs/` is **generated by Wails**. Never hand-edit it; regenerate by running `wails dev`/`wails build`.
- Stores are zustand. Every store that calls a binding must degrade when the bridge is missing: wrap the call in `try/catch` and fall back to fixtures with an `offline` flag (see `cluster.store.ts`). `EventsOn` subscriptions need the same guard. `cluster.store.ts` owns that flag — other stores read `useClusters.getState().offline` rather than deciding for themselves.
- Tailwind v4 with a semantic `@theme` palette in `src/styles/global.css` (`base`/`surface`/`raised`/`overlay`/`line`, `text`/`muted`/`faint`, `accent`, `ok`/`warn`/`danger`/`info`). Use those tokens — no raw hex, no default Tailwind grays.
- Every list view is virtualized with `@tanstack/react-virtual`. `shared/ui/DataGrid.tsx` is the one implementation: fixed row height, grid template derived from a `Column[]` spec, header scroll synced to the body, Excel-style cell/range selection (`shared/ui/grid.selection.ts`). A kind-specific table is a `Column[]` file (`features/resources/pod.columns.tsx`) passed to it, never a new grid. Row height is fixed at 30px and cells centre with flexbox: a `cell` renderer must size itself (use `shared/ui/Badge.tsx`'s `Pill` for chips) and never rely on the cell's typography, or it will grow past the row — measure it against the row before calling it done.
- A resource kind is **data**: `features/resources/kinds.ts` maps a nav leaf id to `{ gvr, namespaced, columns }`. Adding a kind is one `*.columns.tsx` file plus one entry — the table, the filter and the drawer's Overview all read the same `Column[]`.
- `resource.store.ts` holds `Map<uid, object>` per subscription and applies incoming batches once per animation frame. `AppShell` reconciles subscriptions from `open tabs × active cluster`, so switching tabs never restarts an informer.
- Open views are tabs (`features/tabs/tab.store.ts`); the sidebar and command palette open/focus a tab, they do not hold the current selection.
- Anything you watch rather than read — logs and shells — is a **dock tool** (`features/dock`), not a drawer tab. The drawer is for one object's static detail. Add a `DockTool.kind`, never a second panel.
- "Which containers can I attach to" is answered once, by `features/containers` over `ContainerAPI.Targets`. Logs and terminal both read it; neither imports the other.
- Port Forwarding has no GVR, so it is not a kind: `AppShell` renders `features/portforward` from the leaf id, and its rows go through the same `DataGrid` with a `Column<PortForward>[]` spec.
- Panels resize through `shared/ui/Resizer.tsx` and remember their size in `shared/ui/panel.size.ts`. Never hand-roll a drag handle.
- Sidebar tree is static data in `features/navigation/nav.model.ts`; phase 6 replaces it with live discovery.

## Performance budget

Enforce as the app grows (from the roadmap):

- Informer cache is the single source of truth — never re-`List` to refresh a table.
- Every list view is virtualized. No exceptions.
- Coalesce backend resource events (~100ms) and frontend event handling (per animation frame) — a 5k-pod resync must be one update, not 5k.
- Watch only the namespaces in view when a cluster has >5k pods.
- Trim managed fields off objects before sending them to the frontend.
