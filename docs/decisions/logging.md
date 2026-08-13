# Logging

What lands in `nens.log`, who writes it, and what deliberately does not.

### One `slog.Default`, no port

Every other infrastructure concern in this app is a `domain` port with an adapter behind it, and
logging is deliberately not. `log/slog` is the standard library's own global sink, so an adapter
would only be a second name for `slog.Default()` — and every package that logs would have to be
handed a logger to keep the indirection honest. `internal/logging` therefore configures the global
handler and nothing else; packages call `slog` directly. The one exception is `resource.watch`,
which is handed a `*slog.Logger` already carrying its cluster, resource and namespace, because a
watch error is meaningless without knowing which watch raised it.

`internal/domain` still logs nothing: it holds entities and ports, and neither has behaviour to
report.

### The log lives beside settings.json, and rolls at 4 MiB

`config.Dir()` became a package function so the settings file and the log file resolve the same
`%AppData%/Nens` exactly once. The settings dialog's **Open folder** button already leads there, so
"send me your log" needs no extra UI.

The size is checked on **every write**, not at startup: a session that tails a busy cluster all day
is precisely the one that would fill a disk, and a check only at launch would never fire for it. One
previous file is kept (`nens.log.1`), so the ceiling is 8 MiB. When the rename fails — an antivirus
holding the file is the usual reason — the writer reopens and keeps appending rather than dropping
the line; an oversized log beats a missing one.

A directory that cannot be written is not fatal either: the handler keeps stderr, says so once, and
the app runs. `wails dev` prints to stderr regardless, which is why the file is a `MultiWriter` and
stderr comes first — if the file write fails, the line has already reached the terminal.

### The webview logs into the same file

Wails takes a `logger.Logger`, and everything the frontend sends through the runtime's `Log*` calls
passes through it. `logging.Wails()` bridges that into slog with `source=webview`, so a crash in the
UI and the informer error that caused it are one file apart, not two.

Wails filters by its own level before ours, so it is handed the widest level slog will still print:
`INFO` normally, `DEBUG` when `NENS_LOG_LEVEL=debug`. Passing `DEBUG` unconditionally would drown the
file in `wails dev`'s per-asset-request lines.

The frontend's side of that bridge is `shared/lib/report.ts`: an `ErrorBoundary` around the app, plus
`window` `error` and `unhandledrejection` handlers. A module-scope throw never reaches a React
boundary — that is exactly what the window handler covers — and the boundary exists for the other
half: a render crash blanks the window, and a blank window is unreportable. In the browser preview
`LogError` throws because there is no bridge, so the report falls back to the console.

### What is logged is what a user report needs

Lifecycle (start/stop, connect/disconnect with the server version and how long the dial took),
informers starting and stopping, sessions (logs, exec, forwards) opening and failing, and every
**write**: apply, delete, scale, helm rollback and uninstall each leave one line naming the cluster,
namespace and object. That last group is an audit trail — "what did this app change in my cluster"
is the question a Kubernetes client has to be able to answer.

Deliberately absent: anything per resource event. An informer resync of 5k pods is one coalesced
frontend batch, and it must not become 5k log lines. The same reasoning puts the metrics poll at
`DEBUG`: it runs every 30s and its usual failure — no metrics-server — is an answer, not an error.

Nothing logs an object's contents, a token, or a kubeconfig's credentials: the paths and names are
what identify a problem, and the values are what would make the file unsafe to send.
