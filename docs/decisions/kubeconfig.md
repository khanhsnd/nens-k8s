# Kubeconfigs

Where the cluster list comes from, and what "add a kubeconfig" is allowed to touch.

### `internal/config` arrived early

Phase 9 owns settings persistence, but "add a kubeconfig" is pointless if it does not
survive a restart. `config.Store` is the seed of that package: JSON at
`os.UserConfigDir()/Nens/settings.json`, currently one key (`kubeconfigs`). It never
fails to construct — a missing user config dir is reported by `Dir()`/`Save` so the error
surfaces in the dialog instead of at startup.

### Added files are extra `Precedence` entries, not a replacement

`kubeconfig.Loader.rules()` rebuilds `clientcmd.NewDefaultClientConfigLoadingRules()` on
every call and appends the saved paths. So `KUBECONFIG` and `~/.kube/config` keep working
and keep winning on duplicate context names, and a file added in the UI is visible to the
next `Clusters()` call without a restart. Building the rules once in the constructor —
which is what the code did before — would have frozen the list at startup.

### Paste writes a file, it does not store the YAML

`Import` validates with `clientcmd.Load`, then writes to
`os.UserConfigDir()/Nens/kubeconfigs/<context-slug>.yaml` and tracks that path like any
other. One code path afterwards, and `exec` credential plugins keep working because they
are just fields in the file.

`Remove` deletes the file only when it sits inside that imported directory — a kubeconfig
the user merely pointed at is never touched, only unreferenced.

### A folder is the same `Add`, not a second entry point

`Add` stats the path: a file is validated and tracked as before, a directory is read one
level deep and every entry that `clientcmd` parses is tracked. So typing a folder path
into the dialog works too, and there is one code path to keep honest. Entries that do not
parse are skipped rather than failing the whole folder — a `~/.kube` holds caches,
certificates and notes next to the configs — but a folder with nothing usable is an error,
otherwise "added" would mean nothing happened. Recursion is deliberately not done: the
cache directories under `~/.kube` are exactly what a recursive walk would drag in.

`trackAll` writes the batch to settings once; `track` is now a one-element call into it,
so `Import` keeps its old behaviour.

### The native file dialog lives in `internal/app`

`KubeconfigAPI.Pick` calls `runtime.OpenFileDialog` and `PickFolder`
`runtime.OpenDirectoryDialog` — the native dialogs pick one or the other, never both,
which is why the UI has two browse buttons feeding one path field. `internal/app` is the Wails edge, so
the import belongs there; a webview `<input type="file">` cannot give an absolute path,
and reading the contents instead would turn "point at my kubeconfig" into a silent copy
that goes stale.
