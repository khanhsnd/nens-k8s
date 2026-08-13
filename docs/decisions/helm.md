# Helm

Listing releases, reading a revision, comparing two of them, rolling back and uninstalling.

### helm's own library, wired to the connection we already have

`helm.sh/helm/v3/pkg/action` is the only sane implementation of "roll back": it re-applies the
manifest a stored revision carries, in the order helm decided, with helm's hooks and its
ownership rules. Reimplementing that over the dynamic client would be a second Helm, and a
worse one. Reading is the cheap half — a release is a Secret holding gzipped JSON — but reading
it by hand while writing it through helm would leave two encoders of the same format.

The dependency costs a k8s bump (0.34.1 → 0.34.2, helm v3.19's line) and a large transitive
tree. helm v3.21 was rejected for now: it wants Go 1.26 and k8s 0.36, which is a bigger move
than this feature is worth.

What helm does *not* get is its own connection. `internal/kube/helm.getter` implements
`genericclioptions.RESTClientGetter` over a `cluster.Connection`, so helm's factory is handed
the REST config, the cached discovery client and the REST mapper the app already dialled. It is
also its own `clientcmd.ClientConfig`, because the only thing helm reads off that loader is the
namespace — which the caller passed in. Nothing here re-reads a kubeconfig, and nothing outlives
the connection.

`action.Configuration` is then built by hand rather than through `Init`:

```go
&action.Configuration{
	RESTClientGetter: target,
	KubeClient:       kube.New(target),
	Releases:         storage.Init(driver.NewSecrets(conn.Clientset().CoreV1().Secrets(namespace))),
	Log:              func(string, ...any) {},
}
```

`Init` would build a second clientset from the same config. Taking the storage driver off
`conn.Clientset()` instead is both one client fewer and the reason every read here is testable:
`client_test.go` seeds real release Secrets into `client-go`'s fake clientset through helm's own
storage driver, and only `IsReachable`'s `/version` call needs an `httptest` server.

Only the Secret driver is supported. It is helm's default; `configmaps` and `sql` would each be
another storage format to keep working, and a cluster using one is rare enough to be a bug
report rather than a branch.

### No context, because helm has none

`domain.HelmClient` is the one port with no `context.Context`. `List`, `Get`, `History`,
`Rollback` and `Uninstall` take none in helm v3 — a parameter this adapter could only ignore
would promise a cancellation it cannot deliver. `HelmAPI` therefore binds no context either,
which is why it is missing from `App.Startup`'s list.

The practical consequence: a long rollback cannot be cancelled, and disconnecting the cluster
does not stop one that is in flight. That is helm's behaviour in the CLI too.

### A release is not a Kind

It has no GVR, no UID and no informer — helm's identity is `(namespace, name)` inside a
cluster, and `releaseKey` is exactly that pair. So `KINDS` says nothing about it, `AppShell`
renders `features/helm` from the leaf id, and the view owns its own fetch and its own drawer,
the way Port Forwarding does.

Nothing watches. A release changes when someone changes it, so `helm.store.ts` reads on open,
on cluster change, after a write of its own, and when the user presses Refresh. A poll like
`features/metrics`' would be wrong here: metrics move on their own, releases do not.

`Releases(clusterID)` lists every namespace and the frontend filters — one namespace-scoped
call per selected namespace would be several round trips to answer a question the user is
still narrowing, and `useNamespaceFilter` is per cluster rather than per table, so the Helm
table honours the same choice the Pods table does.

Writing goes through the store rather than the api module, because a rollback that does not
refresh the table has lied about what happened. The drawer's release is *looked up* in the
store's list rather than held: after a rollback the row carries a new revision and the drawer
re-reads, and after an uninstall the row is gone and the drawer closes.

### Two revisions, two reads, one unified diff

Helm keeps every revision, so comparing them needs no state: `Detail(ref, revision)` twice and
a line diff. Revision 0 means "whatever is current", which is what the drawer opens with.

The diff is unified, not side-by-side: the drawer starts at 460px and two 40-column panes are
unreadable there. `shared/lib/diff.ts` matches the common head and tail first and only aligns
what is left with an LCS table — two revisions of a manifest differ in a handful of lines, so
the table is tiny even when the files are not. Above two million cells it stops aligning and
says so in the header (`exact: false`), which is honest about a 3k-line rewrite instead of
freezing on it.

Values *and* manifest, though the roadmap only asked for values: a release installed with the
chart's defaults has no values at all, so a values-only diff would show nothing while the chart
version bump changed every rendered object. Both come out of the same `Detail` call, so the
toggle costs nothing.

`values` is what the user supplied (`release.Config`), the same thing `helm get values` prints,
and an empty one is sent as `""` rather than `{}` — a diff of `{}` against `{}` reads as a
change that is not there.

### Charts are not in this phase

`nav.model.ts` used to carry a "Charts" leaf next to "Releases". Repositories, search and
install are a different feature — one that needs a chart cache, repo credentials and a values
editor — and a leaf that opens "not wired up yet" is worse than no leaf, so it was removed
rather than left as a promise.
