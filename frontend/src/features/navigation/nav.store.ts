import { create } from 'zustand'
import { NAV_SECTIONS } from './nav.model'

type NavState = {
  expanded: Record<string, boolean>
  toggleSection: (sectionId: string) => void
}

const initialExpanded = Object.fromEntries(
  NAV_SECTIONS.map((section) => [section.id, section.id === 'cluster' || section.id === 'workloads']),
)

export const useNav = create<NavState>((set) => ({
  expanded: initialExpanded,
  toggleSection: (sectionId) =>
    set((state) => ({ expanded: { ...state.expanded, [sectionId]: !state.expanded[sectionId] } })),
}))
