import { useMemo } from 'react'
import { create } from 'zustand'
import { sliceKey, useResources } from '@/features/resources/resource.store'
import { load, save } from '@/shared/lib/persist'
import { TOPOLOGY_KINDS, type Sources } from './topology.model'
import type { Layer } from './topology.types'

const KEY = 'topology-layers'

/** Workloads are the spine of the picture; the rest of the layers are a choice. */
const DEFAULT_LAYERS: Record<Layer, boolean> = {
  ingress: true,
  service: true,
  workload: true,
  pod: true,
  node: true,
}

type TopologyState = {
  layers: Record<Layer, boolean>
  /** Workload key → its pods are drawn instead of being a count on its card. */
  expanded: Record<string, boolean>
  toggleLayer: (layer: Layer) => void
  toggleExpanded: (key: string) => void
  collapseAll: () => void
}

export const useTopology = create<TopologyState>((set) => ({
  layers: { ...DEFAULT_LAYERS, ...load<Partial<Record<Layer, boolean>>>(KEY, {}) },
  expanded: {},

  toggleLayer: (layer) =>
    set((state) => {
      const layers = { ...state.layers, [layer]: !state.layers[layer] }
      save(KEY, layers)
      return { layers }
    }),

  toggleExpanded: (key) =>
    set((state) => ({ expanded: { ...state.expanded, [key]: !state.expanded[key] } })),

  collapseAll: () => set({ expanded: {} }),
}))

/**
 * The informer caches the graph is built from. `slices` changes once per drained
 * batch, so the graph is rebuilt when the cluster changes and not per render.
 */
export function useTopologySources(clusterId: string): Sources {
  const slices = useResources((state) => state.slices)

  return useMemo(() => {
    const sources: Sources = {}
    for (const kindId of TOPOLOGY_KINDS) {
      sources[kindId] = slices[sliceKey(clusterId, kindId)]?.objects
    }
    return sources
  }, [slices, clusterId])
}
