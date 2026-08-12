# Panels

The bottom dock, the detail drawer, and one resizer for all of them.

### Logs live in a bottom dock, not the detail drawer

The drawer is 460px of a side panel — the wrong shape for the thing people stare at longest. Logs
moved to `features/dock`, a full-width panel above the status bar with its own tab strip, so several
pods can stream at once and each gets the window's full width. Phase 5's shell is the second tool of
the same dock; `DockTool.kind` is the only thing that grows.

Inactive dock tools stay mounted behind `hidden` rather than being unmounted. A dock tab is a live
stream — unmounting on every tab switch would restart it, which is exactly what phase 2 avoided for
resource subscriptions.

The drawer keeps Overview / YAML / Events, and its header is a flat row of icon actions — Logs first,
then Scale, Copy, Delete — instead of the `⋯` dropdown it used to be. Logs is the action people reach
for most; one click behind a menu is where it went missing. Which kinds show it is data, like
everything else about a kind: `Kind.logs` in `features/resources/kinds.ts`.

### One `Resizer`, one persisted size store

`shared/ui/Resizer.tsx` drags one edge of *its own parent* — it measures the parent's box at
pointerdown and reports the new size, so there is no per-panel arithmetic and no hardcoded offset
(the sidebar's handle used to subtract the cluster rail's 56px by hand). `shared/ui/panel.size.ts`
keeps every panel's size under one localStorage key, clamped to per-panel bounds, which is why
`sidebarWidth` left `nav.store`.

Bounds are a preference; the viewport is a hard limit. So the store clamps to a fixed min/max and the
panel additionally carries a CSS `max-w-[70vw]` / `max-h-[80vh]`, which keeps a size saved on a large
monitor from swallowing a small window.
