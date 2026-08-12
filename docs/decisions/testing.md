# Testing

`internal/kube/resource` is covered by `k8s.io/client-go/dynamic/fake`, which drives a
real dynamic informer with no API server. `internal/kube/discovery` scripts its own
`ServerPreferredResources` because the fake clientset's discovery answers that call with
nothing, and reads its CRDs through the same fake dynamic client.

Never point tests — or manual runs — at the maintainer's kubeconfig contexts without
explicit permission.
