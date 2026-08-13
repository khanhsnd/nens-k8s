# Testing

`internal/kube/resource` is covered by `k8s.io/client-go/dynamic/fake`, which drives a
real dynamic informer with no API server. `internal/kube/discovery` scripts its own
`ServerPreferredResources` because the fake clientset's discovery answers that call with
nothing, and reads its CRDs through the same fake dynamic client.

`internal/kube/helm` runs helm's real actions against `client-go`'s fake clientset: the
release Secrets are seeded through helm's own storage driver, so they are shaped exactly
like the ones `helm install` leaves behind. The one thing a fake cannot answer is helm's
`IsReachable`, which calls `/version` — an `httptest` server serves it. `Rollback` and
`Uninstall` are not covered: both go through helm's kube client, which needs an API server
to apply and delete against.

`internal/kube/cluster` dials an `httptest` server that answers `/version`, which is the
only call `Dial` makes — so connect, its two failure paths, disconnect, rename and
shutdown are all covered without an API server. `internal/kube/resource` covers the
informer's ref-counting through the same fake dynamic client: one informer per
(cluster, GVR, namespace), kept while a token remains, dropped when the connection
closes.

`internal/config` points `AppData`, `XDG_CONFIG_HOME` and `HOME` at a temp dir, because
`os.UserConfigDir` reads a different one on each platform. `internal/update` serves its
own release feed, installer and `checksums.txt` from an `httptest` server; what it cannot
cover is `startInstaller`, which hands a real exe to the shell.

Never point tests — or manual runs — at the maintainer's kubeconfig contexts without
explicit permission.
