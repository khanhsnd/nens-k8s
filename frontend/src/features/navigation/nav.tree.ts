import type { ApiResource } from '@/features/discovery/discovery.types'
import { catalog, customKindId } from '@/features/resources/catalog'
import { KINDS } from '@/features/resources/kinds'
import { CUSTOM_SECTION_ICON, NAV_SECTIONS, type NavLeaf, type NavSection } from './nav.model'

/**
 * The tree the connected cluster can actually show: curated sections minus the
 * kinds it does not serve, plus one section per custom API group.
 *
 * Without discovery this is the declared catalog — a cluster that is not
 * connected keeps its tree rather than collapsing to nothing.
 */
export function navSections(resources?: ApiResource[]): NavSection[] {
  const kinds = catalog(resources)

  // A leaf that declares no kind — Overview, Port Forwarding, Helm — is a view,
  // not a resource, so discovery has nothing to say about it.
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    children: section.children.filter((leaf) => !(leaf.id in KINDS) || kinds.has(leaf.id)),
  })).filter((section) => section.children.length > 0)

  return resources ? [...sections, ...customSections(resources)] : sections
}

/**
 * Discovery answers with the Kind, which is singular — "Order" next to "Pods" and
 * "Releases" reads like a mistake. Kubernetes' own singular → plural rule gives
 * back the plural while keeping the CamelCase that `gvr.resource` has already
 * flattened away: "NetworkPolicies", not "networkpolicies".
 */
function plural(kind: string): string {
  if (/(s|x|z|ch|sh)$/i.test(kind)) return `${kind}es`
  if (/[^aeiou]y$/i.test(kind)) return `${kind.slice(0, -1)}ies`
  return `${kind}s`
}

/**
 * An API group is a domain its vendor owns, and one product usually owns several
 * of them — `cert-manager.io` and `acme.cert-manager.io` are one install. A
 * section per group turns a connected cluster's sidebar into a wall of hostnames
 * nobody reads, so the section is the vendor's domain and the groups it covers
 * stay in the tooltip and in what the sidebar filter matches.
 */
function vendorOf(group: string): string {
  const labels = group.split('.')
  return labels.length > 2 ? labels.slice(-2).join('.') : group
}

const labelOf = (resource: ApiResource) =>
  resource.kind ? plural(resource.kind) : resource.gvr.resource

/** Two groups of one vendor can serve the same Kind; the group is what tells them apart. */
function leavesOf(served: ApiResource[]): NavLeaf[] {
  const seen = new Map<string, number>()
  for (const resource of served) {
    seen.set(labelOf(resource), (seen.get(labelOf(resource)) ?? 0) + 1)
  }

  return served
    .map((resource) => ({
      id: customKindId(resource),
      label:
        seen.get(labelOf(resource))! > 1
          ? `${labelOf(resource)} (${resource.gvr.group})`
          : labelOf(resource),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

function customSections(resources: ApiResource[]): NavSection[] {
  const vendors = new Map<string, ApiResource[]>()

  for (const resource of resources) {
    if (!resource.custom) continue

    const vendor = vendorOf(resource.gvr.group)
    vendors.set(vendor, [...(vendors.get(vendor) ?? []), resource])
  }

  return [...vendors]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, served]) => ({
      id: `crd:${vendor}`,
      label: vendor.split('.')[0],
      hint: [...new Set(served.map((resource) => resource.gvr.group))].sort().join(' · '),
      icon: CUSTOM_SECTION_ICON,
      children: leavesOf(served),
    }))
}
