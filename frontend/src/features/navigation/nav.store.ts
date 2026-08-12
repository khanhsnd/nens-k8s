import { create } from 'zustand'
import { NAV_SECTIONS } from './nav.model'

type NavState = {
  expanded: Record<string, boolean>
  sidebarWidth: number
  toggleSection: (sectionId: string) => void
  setSidebarWidth: (width: number) => void
}

const initialExpanded = Object.fromEntries(
  NAV_SECTIONS.map((section) => [section.id, section.id === 'cluster' || section.id === 'workloads']),
)

export const useNav = create<NavState>((set) => ({
  expanded: initialExpanded,
  sidebarWidth: 232,
  toggleSection: (sectionId) =>
    set((state) => ({ expanded: { ...state.expanded, [sectionId]: !state.expanded[sectionId] } })),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(400, Math.max(180, width)) }),
}))
