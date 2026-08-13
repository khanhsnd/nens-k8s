import type { ApiResource } from '@/features/discovery/discovery.types'
import { genericColumns } from './generic.columns'
import { KINDS, type Kind, type KindSpec } from './kinds'

/** A custom kind is its own nav leaf; the version is left out so a bump keeps the saved tab. */
export const customKindId = (resource: ApiResource) =>
  `crd:${resource.gvr.group}/${resource.gvr.resource}`

function resolve(id: string, spec: KindSpec, served?: ApiResource): Kind {
  const namespaced = served?.namespaced ?? spec.namespaced

  return {
    ...spec,
    id,
    gvr: served?.gvr ?? spec.gvr,
    namespaced,
    kind: served?.kind ?? '',
    verbs: served?.verbs ?? [],
    columns: spec.columns ?? genericColumns(namespaced, served?.columns),
  }
}

const DECLARED = new Map(
  Object.entries(KINDS).map(([id, spec]) => [id, resolve(id, spec)] as const),
)

function build(resources: ApiResource[]): Map<string, Kind> {
  const served = new Map(
    resources.map((resource) => [`${resource.gvr.group}/${resource.gvr.resource}`, resource]),
  )

  const kinds = new Map<string, Kind>()
  for (const [id, spec] of Object.entries(KINDS)) {
    const match = served.get(`${spec.gvr.group}/${spec.gvr.resource}`)
    if (match) kinds.set(id, resolve(id, spec, match))
  }

  for (const resource of resources) {
    if (!resource.custom) continue
    kinds.set(customKindId(resource), {
      id: customKindId(resource),
      gvr: resource.gvr,
      namespaced: resource.namespaced,
      kind: resource.kind,
      verbs: resource.verbs,
      columns: genericColumns(resource.namespaced, resource.columns),
    })
  }
  return kinds
}

// The catalog is derived from one array that only changes when a cluster is
// discovered, so it is memoised on that array rather than rebuilt per render.
const memo = new WeakMap<ApiResource[], Map<string, Kind>>()

/**
 * Every kind the cluster serves. Without discovery — no cluster connected yet —
 * it is the declared catalog, so the tree and the fixtures still work.
 */
export function catalog(resources?: ApiResource[]): Map<string, Kind> {
  if (!resources) return DECLARED

  let built = memo.get(resources)
  if (!built) {
    built = build(resources)
    memo.set(resources, built)
  }
  return built
}

export function kindFor(leafId: string, resources?: ApiResource[]): Kind | null {
  return catalog(resources).get(leafId) ?? null
}
