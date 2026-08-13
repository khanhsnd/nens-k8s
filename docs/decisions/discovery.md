# Discovery

What the connected cluster serves, the tree built from it, and custom resources.

### The tree is curated sections filtered by discovery, not generated from it

A cluster serves 60–200 resources. Emitting a leaf for each of them, grouped by API group,
is what "rebuild the tree from discovery" literally means and it is a worse sidebar than the
one it replaces — `leases`, `apiservices` and `csistoragecapacities` next to Pods, with no
ordering anyone recognises.

So `features/navigation/nav.model.ts` stays the curated half: which built-in kinds are worth
a leaf, how they group and what they are called. Discovery decides three things over it:

- which of those leaves the cluster actually serves (an old cluster has no `ingressclasses`),
- which **version** each one is (`autoscaling/v2` is `autoscaling/v1` two releases back),
- and one extra section per custom API group, appended after the curated ones.

`features/navigation/nav.tree.ts` is that join and nothing else. A leaf with no kind at all —
Overview, Port Forwarding, Helm — is a view rather than a resource, so discovery has no say
over it and it always shows.

### Custom is derived from the group, not from the CRD list

`APIResource.Custom` is `!builtinGroups[group]`: a fixed list of the Kubernetes groups, and
everything else is an extension. The obvious alternative — match each resource against
`customresourcedefinitions` — needs read permission on CRDs, which plenty of namespace-scoped
users do not have, and it misses aggregated APIs, which are equally "not built in".

The cost is that the list has to grow when Kubernetes adds a group. A new group showing up
under Custom Resources is a visible, harmless failure; the reverse (a CRD group silently
classified as built-in and therefore hidden) is not.

### Printer columns are best effort, on top of that

`additionalPrinterColumns` only exists on the CRD object, so it *does* need the CRD list. That
list is fetched once per connection and folded in by `(group, version, plural)`; if the call
fails the custom kinds still appear, they just fall back to generic Name/Namespace/Age
columns. Two independent facts, two independent failure modes — the tree never depends on the
column fetch.

Columns are matched per **version**: a CRD serving `v1` and `v1alpha1` prints different things
for each, and discovery already told us which version is preferred.

### A partial discovery answer is kept

`ServerPreferredResources` returns `ErrGroupDiscoveryFailed` *and* every healthy group when
one aggregated API is unreachable — a dead metrics-server is the usual cause and it is common
enough that treating the error as fatal would leave the tree empty on a working cluster. The
error is only surfaced when nothing came back at all.

### Only list + watch survives the filter

Subresources (`pods/log`) are dropped, and so is anything that cannot be both listed and
watched (`componentstatuses`). Every leaf the frontend shows becomes an informer, so a leaf
that cannot back one is a leaf that opens an error.

### The cache dies with the connection

`discovery.Cache` keys entries by cluster id and hangs a goroutine off
`conn.Context().Done()` that evicts on disconnect — the same shape as `resource.Store`'s
watches, and for the same reason: reconnecting must rediscover rather than answer from a dead
cluster's snapshot. `Refresh` additionally calls `Invalidate()` on the memory-cached discovery
client, because that client has a cache of its own and a CRD installed while the app was
running is invisible until both are cleared. It is wired to the cluster row's Reload button.

### The kind spec declares a fallback, the catalog resolves it

`KINDS` entries carry a group, a resource, a version and a scope, but only the group and the
resource are load-bearing: `catalog.ts` matches on those two and takes the version and the
scope from discovery. The declared version is what fixture mode and a not-yet-connected
cluster use, so the tree looks right before anything is discovered.

That also made columns optional. A kind with no columns file renders
`genericColumns(namespaced, printerColumns)`, which is what every custom kind gets and what
turned the built-in leaves that used to say "not wired up yet" into working tables.

### A custom kind's id drops the version

The leaf id is `crd:<group>/<resource>`, not `crd:<group>/<version>/<resource>`. A tab is
saved by id, and a CRD that graduates from `v1beta1` to `v1` would otherwise orphan every
saved tab pointing at it — while the group and the plural are exactly the identity that
survives that bump.

`catalog()` is memoised on the discovered array with a `WeakMap`, so the join runs once per
discovery rather than once per render.

### A custom leaf is labelled with the plural Kind

Discovery answers with `kind`, which is singular — "Order" and "Challenge" sitting under
`acme.cert-manager.io` while every curated leaf above them says "Pods", "Deployments",
"Releases". The label is therefore the Kind put through Kubernetes' own singular → plural
rule (`s/x/z/ch/sh` → `es`, consonant + `y` → `ies`, otherwise `s`): "Orders",
"NetworkPolicies", "Prometheuses".

The plural is *not* taken from `gvr.resource`, which is already plural and would be free:
it is lowercased, so `networkpolicies` and `servicemonitors` lose the word boundaries the
Kind still has. Pluralising costs four lines and keeps "ServiceMonitors" readable.

### The section is the vendor, not the group

A section per API group is what discovery hands you, and on a real cluster that is a column
of hostnames — `acme.cert-manager.io`, `cert-manager.io`, `configuration.konghq.com`,
`crd.projectcalico.org`, `monitoring.coreos.com` — appearing the moment a cluster connects.
Half of them are the *same product*: a group is a domain its vendor owns, and one install
routinely owns several.

So the section is the registrable domain (the last two labels of the group) and its label is
that domain's first label: `cert-manager`, `konghq`, `projectcalico`, `coreos`. Both
cert-manager groups fold into one section, and the wall becomes one entry per thing actually
installed.

Nothing is lost, because nothing is thrown away:

- the section's tooltip lists the groups it stands for, and the sidebar filter matches them,
  so typing `acme.cert-manager.io` still finds Orders;
- the leaf id is still `crd:<group>/<resource>`, so a tab still resolves by the full group;
- two groups of one vendor serving the same Kind — the one case where a label would be
  ambiguous — get the group appended to the label.

Shortening a name is a guess when the name is arbitrary. It is not one here: the domain is
structured, and the part before the public suffix is exactly the vendor's own name for
itself.

### A custom resource tab carries its own title

`tab.store` rebuilt every title from `nav.model`, which a custom kind is not in. `makeTab`
now prefers the nav model's label and falls back to a title passed in by whoever opened the
tab, and that title is saved alongside the ids. So a CRD tab survives a restart, and renaming
a built-in leaf in `nav.model` still renames its saved tab.

### The JSONPath reader is a subset, deliberately

`shared/lib/jsonpath.ts` handles dotted fields, numeric indexes, bracketed keys and the
`[?(@.type=="Ready")]` equality filter every operator writes to pick a condition out of
`.status`. That is what `additionalPrinterColumns` uses in practice. Pulling in a full
JSONPath implementation would add a dependency to render a table cell; anything it cannot
parse renders `—`, which is also what a missing field renders.
