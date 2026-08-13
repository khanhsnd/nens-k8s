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

### The tab strip's context menu is hand-rolled, and middle click closes on `mousedown`

`ContextMenu` (`shared/ui/ContextMenu.tsx`) is a fixed-position menu at a point, clamped into the
window after it is measured. Radix's dropdown was the obvious reuse and is the wrong shape: it
anchors to a trigger element, and anchoring to the pointer means feeding it a virtual element —
more wiring than the whole component. It closes on Escape, blur, resize and any pointerdown
outside itself; the outside check is a `contains` test rather than a blanket close, because
closing on the pointerdown that precedes a click unmounts the item before its click lands.

Middle click closes the tab on `mousedown` with `preventDefault`, not on `auxclick`: the default
middle-button action is autoscroll, and the drag ball it opens eats the release.

The menu's Close to the left/right keep the tab they were opened on and re-activate it only if the
active tab was among the closed ones — closing tabs the user is not looking at must not move them.
