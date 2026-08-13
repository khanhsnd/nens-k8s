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

Never point tests — or manual runs — at the maintainer's kubeconfig contexts without
explicit permission.
