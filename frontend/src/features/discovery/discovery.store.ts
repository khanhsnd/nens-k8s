import { create } from 'zustand'
import { listApiResources, refreshApiResources } from './discovery.api'
import type { ApiResource } from './discovery.types'

type DiscoveryState = {
  resources: Record<string, ApiResource[]>
  error: string | null
  /** Discovers every cluster that is connected, once each, and forgets the rest. */
  sync: (connected: string[]) => Promise<void>
  refresh: (clusterId: string) => Promise<void>
}

// Discovery follows connections, not renders — the same shape as the forward
// registry's restore, and for the same reason: it is one call per connection.
const loaded = new Set<string>()

function put(clusterId: string, resources: ApiResource[]) {
  useDiscovery.setState((state) => ({
    resources: { ...state.resources, [clusterId]: resources },
    error: null,
  }))
}

export const useDiscovery = create<DiscoveryState>(() => ({
  resources: {},
  error: null,

  sync: async (connected) => {
    for (const clusterId of loaded) {
      if (connected.includes(clusterId)) continue

      loaded.delete(clusterId)
      useDiscovery.setState((state) => {
        const resources = { ...state.resources }
        delete resources[clusterId]
        return { resources }
      })
    }

    for (const clusterId of connected) {
      if (loaded.has(clusterId)) continue
      loaded.add(clusterId)

      try {
        put(clusterId, await listApiResources(clusterId))
      } catch (error) {
        loaded.delete(clusterId)
        useDiscovery.setState({ error: String(error) })
      }
    }
  },

  refresh: async (clusterId) => {
    try {
      put(clusterId, await refreshApiResources(clusterId))
      loaded.add(clusterId)
    } catch (error) {
      useDiscovery.setState({ error: String(error) })
    }
  },
}))

export const clusterResources = (clusterId: string | null) =>
  (state: DiscoveryState): ApiResource[] | undefined =>
    clusterId ? state.resources[clusterId] : undefined
