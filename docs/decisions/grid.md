# DataGrid

The one table implementation: selection, row actions, column layout and cell sizing.

### Clicking a cell tints the whole row, but the selection rect stays a rect

Rows inside the selection rect get `bg-raised`; cells inside it keep `bg-accent-dim`, and
the drawer's row keeps `bg-accent-dim` across its full width. Widening the rect itself to
the whole row on click would make "select the row" literal at the cost of column-range
drag, and would turn every `Ctrl+C` into a full-row copy.

### The row actions cell is the last grid column, not an overlay

`DataGrid` appends a fixed track to the template and renders a `sticky right-0` cell
holding the three-dot button. Being a real column keeps the header and the body on the same
grid and stops the button from covering data; it repeats the row background because sticky
content scrolls over the cells behind it. It is deliberately not a `Column` in the kind's
spec — selection, copy and keyboard navigation are keyed by `columns.length` and must not
see it.

### Row actions fill the sticky cell, they are not a column of their own

Copy and Stop first shipped as a last `Column` with `min: 62`, which put them left of the grid's own
36px sticky actions cell: two buttons crammed into a normal cell, then an empty gutter, misaligned
with the header's column menu. `DataGrid` now takes `rowActions?: (row) => ReactNode` that fills the
sticky cell instead of the open-details button, and widens that track to 76px when it is used. The
header's menu cell reads the same width, so the two stay aligned — which is the whole reason the
actions cell is a real grid track (see above).

Forwards therefore keep a pure `FORWARD_COLUMNS` data spec, and the view owns its buttons.

### The layout is per grid id, the spec stays immutable data

`shared/ui/grid.layout.ts` keeps `{ order, hidden, widths }` per `layoutId` (the kind id) in one
localStorage key, and `useGridLayout` folds it over the kind's `Column[]`. The columns file stays
the single description of a kind — `hidden: true` is the *default* visibility, `fixed: true` marks
a column the menu cannot untick — and user preference never edits it. Unknown saved keys are
ignored and new columns land at their spec position, so shipping a column never breaks a saved
layout.

Widths are stored per key: a column the user never dragged keeps its `minmax(min, grow fr)` track,
a dragged one becomes a fixed px track. Width `0` means "auto" again, which is what
double-clicking the resize handle writes.

### Reorder is pointer-based, not HTML5 drag-and-drop

Header reordering listens on `pointerdown/move/up` and resolves the drop column with
`document.elementFromPoint` → `[data-column]`, the same shape as the cell range drag. The `draggable`
attribute was the obvious alternative and is worse here: `dataTransfer` drags are unreliable inside
the WebView2 host and untestable from the browser harness.

### The column menu lives outside the scrolled header

The header is a flex row: a clipped track area that translates with the body's `scrollLeft`, plus a
fixed 36px cell holding the menu. That cell is a sibling of the scrolled area rather than a `sticky`
last track, because sticky inside the translated grid does not stay pinned. `scrollbar-gutter: stable`
on the flex row makes its content box match the body's, so header tracks stay aligned with the row
cells and the menu sits exactly over the row-actions column.

### A grid cell centres its content with flexbox, never with the row's line-height

The cell used to set `line-height: 30px` (the row height) to centre its text, and that is what made
bordered chips overflow their row: an `inline-flex` pill *inherits* that leading, so a 10.5px label
became a ~32px box inside a 30px row and got clipped. The workaround of resetting leading per chip
only moved the problem — a cell renderer that is block-level (`flex`) ignores the line box entirely
and hugs the top of the row instead.

So the cell is now `flex items-center` with its content in one `min-w-0 flex-1 truncate` span:
vertical centring comes from flexbox and applies to text and components alike, and truncation still
lives on a single element that owns the ellipsis. `shared/ui/Badge.tsx` also grew a `Pill` primitive
with a fixed height and `leading-none`, so chips have one definition instead of an ad-hoc span per
call site.

The rule this file exists to record: **anything a column renders must not depend on the cell's
typography to size itself.** Measure a chip against its row (`getBoundingClientRect`) before calling
it done — this class of bug is invisible until a border is drawn around it.

### Pod warnings are derived from container state, not events

`podWarnings` flags a container that waits on anything other than `ContainerCreating`/
`PodInitializing`, terminates non-zero, or is not ready while the pod says `Running`. Lens computes
that column from warning `Event` objects — we have no events until phase 3, and container state is
the signal that actually explains the row. Restart count alone is deliberately not a warning: a pod
that restarted once a week ago would then stay yellow forever.

### CPU/Memory columns exist but have no source yet

They read `K8sObject.metrics`, which nothing populates until phase 7 wires `metrics.k8s.io`, so they
ship hidden by default and render `—` when ticked. Shipping them visible would put two dead columns
in front of every user; leaving them out would mean re-doing the column spec in phase 7.
