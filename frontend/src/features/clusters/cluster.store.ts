import { create } from 'zustand'
import { Connect, Disconnect, List, Rename } from '@bindings/go/app/ClusterAPI'
import { EventsOn } from '@bindings/runtime/runtime'
import type { Cluster } from './cluster.types'
import { FIXTURE_CLUSTERS } from './cluster.fixtures'

type ClusterState = {
  clusters: Cluster[]
  activeId: string | null
  offline: boolean
  load: () => Promise<void>
  activate: (id: string) => Promise<void>
  connect: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
}

function patch(id: string, changes: Partial<Cluster>) {
  return (state: ClusterState) => ({
    clusters: state.clusters.map((c) => (c.id === id ? { ...c, ...changes } : c)),
  })
}

export const useClusters = create<ClusterState>((set, get) => ({
  clusters: [],
  activeId: null,
  offline: false,

  load: async () => {
    try {
      const clusters = (await List()) as Cluster[]
      set({ clusters, offline: false, activeId: get().activeId ?? clusters[0]?.id ?? null })
    } catch {
      set({ clusters: FIXTURE_CLUSTERS, offline: true, activeId: FIXTURE_CLUSTERS[0].id })
    }
  },

  activate: async (id) => {
    set({ activeId: id })
    await get().connect(id)
  },

  connect: async (id) => {
    if (get().offline) {
      const fixture = FIXTURE_CLUSTERS.find((c) => c.id === id)
      return set(patch(id, { phase: 'connected', version: fixture?.version ?? '' }))
    }
    try {
      const cluster = (await Connect(id)) as Cluster
      set(patch(id, cluster))
    } catch (error) {
      set(patch(id, { phase: 'error', error: String(error) }))
    }
  },

  disconnect: async (id) => {
    if (!get().offline) await Disconnect(id)
    set(patch(id, { phase: 'disconnected', version: '' }))
  },

  rename: async (id, name) => {
    const next = name.trim()
    if (next === '') return
    if (!get().offline) await Rename(id, next)
    set(patch(id, { name: next }))
  },
}))

export function subscribeClusterEvents() {
  try {
    return EventsOn('cluster:changed', (cluster: Cluster) => {
      useClusters.setState((state) => ({
        clusters: state.clusters.map((c) => (c.id === cluster.id ? cluster : c)),
      }))
    })
  } catch {
    return () => {}
  }
}

export function activeCluster(state: ClusterState): Cluster | null {
  return state.clusters.find((c) => c.id === state.activeId) ?? null
}
