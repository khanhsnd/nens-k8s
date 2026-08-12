import { create } from 'zustand'
import { NAV_SECTIONS } from './nav.model'

type NavState = {
  expanded: Record<string, boolean>
  collapsedCluster: string | null
  toggleSection: (sectionId: string) => void
  toggleCluster: (clusterId: string) => void
}

const initialExpanded = Object.fromEntries(
  NAV_SECTIONS.map((section) => [section.id, section.id === 'cluster' || section.id === 'workloads']),
)

/**
 * The open cluster is the active one, so `collapsedCluster` only records the single
 * cluster the user folded shut by hand — activating another one reopens the tree
 * without anything having to clear it.
 */
export const useNav = create<NavState>((set) => ({
  expanded: initialExpanded,
  collapsedCluster: null,

  toggleSection: (sectionId) =>
    set((state) => ({ expanded: { ...state.expanded, [sectionId]: !state.expanded[sectionId] } })),

  toggleCluster: (clusterId) =>
    set((state) => ({ collapsedCluster: state.collapsedCluster === clusterId ? null : clusterId })),
}))
