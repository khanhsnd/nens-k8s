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

function customSections(resources: ApiResource[]): NavSection[] {
  const groups = new Map<string, NavLeaf[]>()

  for (const resource of resources) {
    if (!resource.custom) continue

    const leaves = groups.get(resource.gvr.group) ?? []
    leaves.push({ id: customKindId(resource), label: resource.kind || resource.gvr.resource })
    groups.set(resource.gvr.group, leaves)
  }

  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, leaves]) => ({
      id: `crd:${group}`,
      label: group,
      icon: CUSTOM_SECTION_ICON,
      children: leaves.sort((a, b) => a.label.localeCompare(b.label)),
    }))
}
