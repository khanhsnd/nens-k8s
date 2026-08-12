import { useCallback } from 'react'
import { create } from 'zustand'
import { useClusters } from '@/features/clusters/cluster.store'
import { load, save } from '@/shared/lib/persist'

const KEY = 'namespace-filter'

type NamespaceState = {
  byCluster: Record<string, string[]>
  scope: (clusterId: string, namespaces: string[]) => void
}

/** The filter was a single namespace before it was a set. */
function stored(): Record<string, string[]> {
  const saved = load<Record<string, string | string[]>>(KEY, {})
  return Object.fromEntries(
    Object.entries(saved).map(([clusterId, chosen]) => [
      clusterId,
      Array.isArray(chosen) ? chosen : chosen ? [chosen] : [],
    ]),
  )
}

const useNamespaces = create<NamespaceState>((set) => ({
  byCluster: stored(),

  scope: (clusterId, namespaces) =>
    set((state) => {
      const byCluster = { ...state.byCluster, [clusterId]: namespaces }
      save(KEY, byCluster)
      return { byCluster }
    }),
}))

const NONE: string[] = []

/**
 * One filter per cluster, not per table: "which namespaces am I working in" is a
 * property of the cluster, and it survives a restart so nobody picks them twice.
 */
export function useNamespaceFilter() {
  const clusterId = useClusters((state) => state.activeId) ?? ''
  const namespaces = useNamespaces((state) => state.byCluster[clusterId] ?? NONE)
  const scope = useNamespaces((state) => state.scope)

  return [
    namespaces,
    useCallback((next: string[]) => scope(clusterId, next), [clusterId, scope]),
  ] as const
}
