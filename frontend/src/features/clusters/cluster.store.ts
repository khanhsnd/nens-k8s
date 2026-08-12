import { create } from 'zustand'
import { Connect, Disconnect, List } from '@bindings/go/app/ClusterAPI'
import { EventsOn } from '@bindings/runtime/runtime'
import type { Cluster } from './cluster.types'
import { FIXTURE_CLUSTERS } from './cluster.fixtures'

type ClusterState = {
  clusters: Cluster[]
  activeId: string | null
  offline: boolean
  load: () => Promise<void>
  activate: (id: string) => Promise<void>
  disconnect: (id: string) => Promise<void>
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
    if (get().offline) return
    try {
      const cluster = (await Connect(id)) as Cluster
      set((state) => ({ clusters: state.clusters.map((c) => (c.id === id ? cluster : c)) }))
    } catch (error) {
      set((state) => ({
        clusters: state.clusters.map((c) =>
          c.id === id ? { ...c, phase: 'error', error: String(error) } : c,
        ),
      }))
    }
  },

  disconnect: async (id) => {
    if (!get().offline) await Disconnect(id)
    set((state) => ({
      clusters: state.clusters.map((c) =>
        c.id === id ? { ...c, phase: 'disconnected', version: '' } : c,
      ),
    }))
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
