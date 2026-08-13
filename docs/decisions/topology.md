# Topology

The cluster graph: what it draws, what it refuses to draw, and why the picture is
laid out the way it is.

## It is a view, not a kind

A topology has no GVR, no UID and no informer of its own, so it follows Port
Forwarding, the Overview and Helm: `AppShell` renders `features/topology` from the
leaf id, and `VIEW_KINDS` expands the tab into the nine kinds it reads
(`TOPOLOGY_KINDS`) before deduplicating them against the other open tabs. Nothing
new is fetched — the graph is a projection of informer caches that `resource.store`
already holds, which is what the performance budget means by "never re-`List` to
refresh a table".

`replicasets` is subscribed but never drawn. It is the only way a pod reaches its
Deployment: `pod → ReplicaSet → Deployment` is the real ownership chain, and
guessing the Deployment by stripping the hash off the ReplicaSet's name is wrong
as soon as somebody names a workload with a dash.

## Layers are columns, namespaces are lanes

Two questions get asked of a cluster picture — *what is in front of what*, and
*what belongs to whom* — so each gets an axis. Ingress → Service → Workload → Pod
→ Node runs left to right; one horizontal band per namespace runs down, with
cluster-scoped objects (Nodes) in a lane of their own at the bottom.

Within a lane and column the order is the barycentre of each node's neighbours,
swept forwards and backwards four times. That is the cheap half of Sugiyama and
enough to stop the curves crossing; a full layered layout would need dummy nodes
per rank and buys nothing at this size.

## What is drawn, and what waits to be asked for

- **Pods are folded into their workload.** A card carries the pod count and
  expands on demand. A Deployment with fifty pods is fifty facts nobody wants
  before they ask; a pod nobody controls is drawn on its own, because nothing
  else represents it.
- **Placement edges appear on focus.** Every pod runs on a node, so drawing
  `workload → node` for every workload is a hairball on any real cluster. The
  edges exist in the graph — the count on each is how many pods land there — and
  are rendered only for whatever is hovered or selected. The Node card always
  carries its own pod count and usage, so the layer says something on its own.
- **A Service points at a workload, not at its pods.** Matching a selector
  against every pod is O(pods × services); the workload's pod template carries
  the same labels, so the edge lands there. Only a pod with no controller is
  matched directly. A Service that selects nothing is painted `warn` rather than
  hidden — it is usually a mistake worth seeing.
- **`MAX_NODES` (320) is a refusal, not a truncation.** Past it the view says how
  many objects the scope has and asks for a namespace, rather than drawing a
  picture that means nothing. The check runs before any edge work, so an
  oversized scope costs one pass over the pods.

## Fit is fit-to-width

Fitting both axes of a graph that is four namespaces tall lands at a zoom nothing
can be read at. The horizontal axis is the one that carries the meaning, so `fit`
scales to the width (never past 1:1) and centres vertically only when the whole
graph already fits; otherwise a stack of lanes is scrolled through like any other
list.

## Selection is shared with the drawer

The topology hands back objects of every kind, so `AppShell`'s selection carries
its own `kindId` and the drawer's `Kind` is resolved from the selection rather
than from the open tab. A table still only owns the rows it drew — `owned` keeps
a pod's drawer from following the user to the Deployments tab — but from the
graph, clicking any card opens the same Overview / YAML / Events drawer with the
same apply, scale and delete actions.

## Fixtures

The graph was verified against the browser dev server, which meant making the
fixtures a cluster rather than a pile of rows: pods now carry `app.kubernetes.io/name`
labels and an owner that matches their app's controller kind (Deployment,
StatefulSet or DaemonSet), ReplicaSets exist so the ownership chain resolves,
Services carry selectors — one of them deliberately carries none — and four
Ingresses route to Services, one of which is deliberately missing. Everything the
view paints differently has a fixture that reaches it.
