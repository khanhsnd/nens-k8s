# Metrics

Sampling `metrics.k8s.io`, the usage a table shows, and the cluster Overview built on both.

### The backend reads, the frontend paces

`metrics.k8s.io` cannot be watched — it only answers a list — so there is nothing for an
informer to own and no event to push. `internal/kube/metrics.Reader` is therefore stateless:
one `Sample(ctx, clusterID)` lists node and pod metrics and maps them to `domain.Usage`. The
30s cadence lives in `features/metrics/metrics.store.ts`, because only the frontend knows
whether anyone is looking.

The alternative — a backend poller pushing `metrics:sample` like the informers push
`resource:event` — buys nothing here. It would need its own ref-counting, its own eviction on
disconnect and its own coalescing, all to deliver a number that the one interested view could
have asked for itself. A cached sample is also strictly worse than a fresh one: it can only
ever be older than the poll the caller was about to make.

`AppShell` starts and stops that poll from what is on screen: `follow(clusterId)` runs when the
open tab is the Overview or a kind that declares `metrics`, and `follow(null)` otherwise. On a
5k-pod cluster the pod metrics list is megabytes, so polling it while the user is reading
ConfigMaps is a cost with no reader.

### One pod is a second, faster poll — and the chart is per sample, not per second

The tables need every pod summed; the detail drawer needs one pod split by container. Those are
different requests, so `MetricsSampler` has both: `Sample` lists the cluster, `PodSample` gets
`metrics.k8s.io/v1beta1/namespaces/<ns>/pods/<name>`. Trimming the cluster-wide list down to one
pod would have meant keeping per-container numbers for 5k pods to serve the one on screen, and
polling that list every 10s — which is what the drawer wants — is megabytes a poll.
`features/metrics/pod.usage.store.ts` owns that 10s cadence and stops when the drawer closes.

metrics-server keeps no history, so the chart is the samples this session collected: 120 of them,
plotted per sample rather than per second, with the container's request and limit as dashed lines.
Two polls often carry the same `timestamp` — metrics-server resamples on its own cadence — and a
repeat is dropped rather than appended, so the line never claims a resolution the data does not
have. A Prometheus-backed hour of history, which is what Lens draws, would need a Prometheus
adapter and a way to reach it; nothing here pretends to be one.

The series is keyed by the pod it was sampled from and reset when another pod is selected: one
frame of the previous pod's chart under a new pod's name is worse than an empty one.

### Missing metrics are an answer, not an error

Most clusters this app will meet have metrics-server; plenty do not, and a few have one that is
still starting. `Sample` returns `MetricsSample{Available: false, Error: …}` for all of them
rather than failing: a `NotFound` (the APIService is not registered) and a `ServiceUnavailable`
(it is registered but nothing is behind it) both become "metrics-server is not available on
this cluster", and anything else carries the API's own message.

A partial sample is deliberately *not* kept. If node metrics arrived and pod metrics did not,
every pod would render `—` next to nodes showing real load, which reads as "these pods are
idle" rather than "this data is missing". Either the whole sample is trustworthy or none of it
is.

The frontend mirrors that. The Overview's CPU and memory donuts render `—` with the reason in a
notice, while node counts, pod phases and warning events — none of which need metrics — carry
on. A poll that fails is retried on the next tick, so installing metrics-server while Nens is
open fixes itself.

### Usage is attached to a row, not merged into the cache

`resource.store` holds what the informer sent and nothing else. `features/metrics/usage.ts`
joins on the way to the table: `withUsage(usage, row)` returns `{...row, metrics}` when a
sample exists for that row's `namespace/name`, and the row itself when it does not. So the
informer cache stays the server's truth, a column reads `row.metrics` and knows nothing about
where it came from, and a cluster with no metrics-server allocates nothing.

Nodes and pods share one index keyed by `` `${namespace}/${name}` ``. A node's key has no
namespace and a pod's always has one, so the two cannot collide and no caller has to decide
which map to look in. That is also why `KindSpec.metrics` is a boolean rather than a scope.

### Capacity is parsed on the frontend, usage on the backend

Usage arrives as millicores and bytes because `resource.ParseQuantity` is already there and a
quantity is a Kubernetes detail, not a UI one. Capacity is different: it is a field of the node
object the informer already delivers, and fetching it again in the sampler would list nodes a
second time purely to avoid 20 lines of parsing. `shared/lib/quantity.ts` reads
`status.allocatable`, and that is the only quantity the frontend ever parses.

Allocatable rather than capacity: it is what the kubelet says is left for pods, and what usage
is worth comparing against.

### The Overview is a view, so it subscribes for itself

The Overview has no GVR and is not a kind — `nav.model.ts` lists it as a leaf, `KINDS` does not
mention it, and `AppShell` renders `features/overview` from the leaf id, the same way Port
Forwarding works.

It does need three slices though (nodes, pods, events), which is the first tab that maps to
more than one kind. `AppShell` expands an overview tab into `OVERVIEW_KINDS` and deduplicates
the result by kind id before calling `sync`: two tabs asking for `pods` must produce one
subscription, because a second `acquire` on the same slice key overwrites the first token and
leaks its informer reference.

Subscribing `events` is the expensive part — events are the highest-churn object in a cluster.
It is accepted because "recent warnings" is the answer the Overview exists to give, and it is
the same informer the Events tab would start anyway. Nothing else on the page needs a list
view, so the warning feed is capped at 25 rows and the node totals are aggregates rather than
a per-node table — the Nodes tab already has the per-node numbers, in its own virtualized grid.
