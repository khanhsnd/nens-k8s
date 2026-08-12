# Settings and appearance

What is stored where, how the type scale works, and what comes back on restart.

### Storage is split by weight, not by feature

`localStorage` holds the preferences the frontend alone acts on: theme, appearance, panel sizes,
grid layouts, the namespace filter, the open tabs and the last selected cluster. `settings.json`
holds what the Go side has to read before any window exists — kubeconfig paths, cluster display
names and port forwards. A forward has to be restarted by the registry when a cluster connects, so
keeping it in the webview's storage would mean the backend asking the frontend what to do.

That is also the boundary for size: a pasted kubeconfig is written to a real file
(`Nens/kubeconfigs/<slug>.yaml`) and only its path is stored, and the settings dialog shows the
config folder with an Open button so the file is reachable outside the app.

### One `load`/`save` pair for every browser-stored preference

`shared/lib/persist.ts` owns the `nens:` prefix, the JSON round trip and the `try/catch` — three
stores had hand-rolled their own, each with a slightly different failure behaviour. Storage being
full or blocked is swallowed on purpose: a preference that cannot be saved must not break the
action that changed it. The theme was stored as a bare string before and is JSON now, so it resets
once to the system preference.

### The type scale is a ratio of one variable, and the layout does not move with it

Text size is a setting, so the ~106 ad-hoc `text-[11.5px]`-style classes became five tokens —
`text-2xs`/`xs`/`sm`/`md`/`lg` — each defined in `@theme` as `calc(var(--app-font-size) * ratio)`.
The appearance store rewrites `--app-font-size` on the root element and nothing else changes.

Setting `html { font-size }` instead — the usual way — was rejected: Tailwind's spacing scale is
rem-based, so it would rescale every padding, gap and icon, while the px constants the grid and the
virtualizers depend on (30px rows, column min widths, autoscroll thresholds) would not follow, and
the two would drift apart. CSS `zoom` on the root has the same problem from the other side: it
scales everything including the boxes `getBoundingClientRect` reports, which is what the resizers
and the cell-range drag measure.

`--text-base` is deliberately **not** defined: `--color-base` exists, so `text-base` already means
the base *colour* in eight places, and giving the same class a font-size would silently take that
colour away.

Anything that sized itself in px against the old text had to follow: `Pill`'s height is `1.7em` so
it tracks its own label (see [grid.md](grid.md) — it is measured against the 30px row at the
largest setting), the log view's line height is read off its probe span instead of a `19px`
constant, and xterm and CodeMirror are handed the family and size explicitly because they paint
their own text and cannot inherit a Tailwind token.

### Installed fonts are read out of the font files

There is no portable OS call for "list the installed families", and the browser's Local Font Access
API needs a permission prompt WebView2 does not surface. So `internal/fonts` opens every file in the
OS font directories and reads its sfnt `name` table: the typographic family (nameID 16) when the
file has one, the legacy family (nameID 1) otherwise, which keeps every weight of a face under one
entry. Names starting with `@` (Windows' rotated CJK variants) and `.` (macOS' hidden system faces)
are dropped because CSS cannot use them.

That is ~200 families in ~2s on a normal Windows install, so the answer is cached for the process
and primed by a goroutine in `SettingsAPI.bind` — the dialog then opens instantly. A font file that
cannot be read is one missing name, never an error.

### Revealing a path opens its folder

`SettingsAPI.Reveal` shells out to `explorer`/`open`/`xdg-open` from `internal/app`, the same edge
that owns the native file dialog. `runtime.BrowserOpenURL` on a kubeconfig would open whatever app
owns `.yaml` instead of showing the file, and `explorer /select,<path>` does not survive the quoting
Go applies to an argument containing spaces — so the folder is opened rather than the file selected.

### The namespace filter is a multi-select menu with its own search box

It was a `<select>` of one namespace, and briefly an `<input list=…>`. Both are wrong for the
question being asked: the interesting view is usually two or three namespaces at once, and a native
datalist cannot show what is already picked. So it is a `DropdownMenu` of `CheckboxItem`s — the same
primitive and the same tick box as the column menu (`shared/ui/MenuCheck.tsx` now holds that markup
for both) — with a search input at the top. An empty selection means every namespace, and the
trigger reads `All namespaces` / the one name / `N namespaces`.

Two things the menu fights over, both settled in favour of the search box:

- The menu focuses its own content on open and offers no hook to redirect that (`onOpenAutoFocus` is
  a `Popover` prop, not a `DropdownMenu` one), so the content's `onFocus` hands focus to the input
  whenever the content itself receives it. Ticking an item also returns focus there, so
  "narrow, tick, narrow again" never needs the mouse to go back to the box.
- Radix's typeahead would eat every keystroke meant for the input, so the input stops propagation of
  everything except `Escape`, `Tab` and the arrows — those stay the menu's, which is what makes
  keyboard navigation into the list still work. `Enter` ticks the top match.

Options are the namespaces present in the loaded rows **unioned with what is selected**: a namespace
that no longer has rows has to stay in the list, or there would be no way to untick it. Matching is
exact — the search box is what does substring matching now.

The selection is stored per **cluster**, not per kind: "which namespaces am I working in" is a
property of the cluster, and scoping Pods to `prod` while Deployments show everything is not a state
anyone asks for. A value saved by the single-select version is read back as a one-element list. The
free-text row filter beside it stays deliberately unsaved — reopening the app to a table that hides
most of its rows for a forgotten reason is worse than retyping.

### Tabs and the last cluster come back, the connection does not

`tab.store` saves `{sectionId, leafId, title}` triples plus the active id through one `subscribe`
rather than a `save` in each action, and rebuilds the titles from `nav.model` on load — a built-in
leaf that no longer exists is dropped, so a saved tab can never outlive its nav entry, while a custom
resource keeps the title it was opened with (see [discovery.md](discovery.md)). `cluster.store`
restores the selection the same way but never calls `Connect`: connecting is the user's decision, and
the tree looks the same either way.
