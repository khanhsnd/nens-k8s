import { create } from 'zustand'
import { listReleases, rollbackRelease, uninstallRelease } from './helm.api'
import type { HelmRef, HelmRelease } from './helm.types'

type HelmState = {
  clusterId: string | null
  releases: HelmRelease[]
  loading: boolean
  error: string | null
  load: (clusterId: string) => Promise<void>
  rollback: (ref: HelmRef, revision: number) => Promise<void>
  uninstall: (ref: HelmRef) => Promise<void>
}

/**
 * Helm's state is a Secret per revision, which nothing watches: a release only
 * changes when someone changes it. So this store reads when the view opens, when
 * the cluster changes and when the user asks — no poll, no event. Writing
 * through it is what keeps the table in step with the write.
 */
export const useHelm = create<HelmState>((set, get) => ({
  clusterId: null,
  releases: [],
  loading: false,
  error: null,

  load: async (clusterId) => {
    // Refreshing the same cluster keeps its rows on screen; switching clears them.
    set((state) => ({
      clusterId,
      loading: true,
      error: null,
      releases: state.clusterId === clusterId ? state.releases : [],
    }))

    try {
      const releases = await listReleases(clusterId)
      if (get().clusterId !== clusterId) return
      set({ releases, loading: false })
    } catch (error) {
      if (get().clusterId !== clusterId) return
      set({ releases: [], loading: false, error: String(error) })
    }
  },

  rollback: async (ref, revision) => {
    await rollbackRelease(ref, revision)
    await get().load(ref.clusterId)
  },

  uninstall: async (ref) => {
    await uninstallRelease(ref)
    await get().load(ref.clusterId)
  },
}))
