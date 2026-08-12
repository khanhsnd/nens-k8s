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

### The native file dialog lives in `internal/app`

`KubeconfigAPI.Pick` calls `runtime.OpenFileDialog`. `internal/app` is the Wails edge, so
the import belongs there; a webview `<input type="file">` cannot give an absolute path,
and reading the contents instead would turn "point at my kubeconfig" into a silent copy
that goes stale.
