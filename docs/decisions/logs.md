# Logs

Streaming, the scrollback buffer, search and backpressure.

### A virtualized line list, not xterm.js

The roadmap called for xterm.js plus its search addon. It is the wrong tool here: a terminal emulator
owns its own scrollback as a cell grid, so "show only the lines matching this regex" is impossible,
match navigation means rescanning that grid, and 200k lines of cells cost far more memory than 200k
strings. The list is the same `@tanstack/react-virtual` shape every other view already uses, which is
also what the performance budget demands. Terminal fidelity is not lost by much — ANSI colour codes
are stripped on ingest (`shared/lib/ansi.ts`) and severity is tinted from the text instead.

Exec still needs xterm.js: it is a real terminal with input, resize and cursor addressing. See
[terminal.md](terminal.md).

### The scrollback lives outside React

`LogBuffer` is a plain class holding the line array; the store only publishes a `version` counter.
Putting 200k lines in zustand state would deep-copy the array on every 100ms chunk. Its `size()/at()`
pair is what the virtualizer reads, so nothing ever materialises a filtered copy of the buffer either.

Trimming is amortised: the array is allowed to run a tenth over capacity so the `splice` happens once
per ~5k lines instead of once per line. 200k lines of realistic log text measured ~47 MB of heap,
which is why 50k is the default and 200k is opt-in.

### The search index is incremental, the highlight is not

`LogBuffer.matches` holds the positions of matching lines and is extended as each chunk arrives, so a
streaming log never rescans what is already buffered — only changing the query does (25ms over 200k
lines). The same index answers both the filter view and match stepping.

Highlight spans are computed per *visible* row at render time. Storing them per line would multiply
the memory of the thing this design exists to keep small.

### Row heights are keyed by the line, and computed rather than measured

Two things renumber the rows under the virtualizer: trimming the scrollback, and switching the search
filter on. `@tanstack/react-virtual` caches measured heights by `getItemKey(index)`, which **defaults
to the index** — so after either of those, row 5 is handed the height of whatever line used to be at
row 5. Wrapped rows then render taller than their slot and pile on top of each other, which is what a
search over a streaming log looked like. `getItemKey` returns `line.n` instead, so a height always
follows its own line.

That alone is not enough: the virtualizer only rebuilds offsets from index 0 when it notices the edge
keys changed, and it only looks for that under `anchorTo: 'end'`. That option is wanted here anyway —
it keeps the viewport on the line you were reading when the front of the buffer is trimmed away. The
cost is a full measurement pass per arriving batch (~4ms at the default 50k lines), paid only while
log lines are actually arriving.

`estimateSize` is then arithmetic, not a guess: the font is monospace and the message column wraps
with `break-all`, so height is `ceil(characters / columns) * lineHeight`, with `columns` derived from
a hidden probe span and a `ResizeObserver` on the scroller (panels are resizable now). Tabs are
expanded on ingest so the character count matches what is painted. `measureElement` stays on as the
corrector for anything the arithmetic cannot know — double-width glyphs, mostly — but it no longer has
to fix up every row on every batch, which is what made it visibly lose the race.

### One stream per container, merged in the frontend

`Start` streams exactly one container, and "all containers" is N tokens pointing at one buffer, each
tagged with a label the lines carry. The backend stays one-stream-one-goroutine, and the ordering
question ("which pod's line came first") is answered by arrival order in one place. `kubectl
--all-containers` does the same fan-out client-side.

### `Targets` resolves anything that owns pods

Rather than restricting the Logs tab to pods, `Targets(ref)` reads a pod's containers directly, and
for anything else follows `spec.selector` — a `LabelSelector` for workloads, a plain label map for
services — and lists up to 200 pods. So the Logs tab is useful on a Deployment, which is where log
reading usually starts. A CronJob is deliberately not resolved: it owns Jobs, not pods.

### Follow is auto-scroll; the backend always follows

The UI's follow toggle only controls scrolling. Wiring it to `PodLogOptions.Follow` would mean
scrolling up stops the stream and scrolling back down reloads the buffer. Leaving is detected by
"scrolled upwards **and** now far from the bottom" — re-measuring a wrapped row can move `scrollTop`
by a few pixels, and either half of that test alone would turn following off by itself.

`previous: true` is the one case that forces `Follow: false` — the API server rejects following a
container that has already died.

### Backpressure is drop-oldest inside the flush window

`sink` is the same shape as the resource watch's coalescer: a pending slice flushed every 100ms. Past
5k pending lines the oldest are dropped and counted, and the count rides along on the next chunk so
the footer can show a real gap. Dropping the *newest* would be the obvious alternative and is wrong —
when a pod floods, the lines you want are the ones it just wrote.
