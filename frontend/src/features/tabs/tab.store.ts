import { create } from 'zustand'
import { NAV_SECTIONS } from '@/features/navigation/nav.model'

export type Tab = {
  id: string
  sectionId: string
  leafId: string
  title: string
}

function makeTab(sectionId: string, leafId: string): Tab {
  const section = NAV_SECTIONS.find((item) => item.id === sectionId)
  const leaf = section?.children.find((item) => item.id === leafId)
  return { id: `${sectionId}:${leafId}`, sectionId, leafId, title: leaf?.label ?? leafId }
}

type TabState = {
  tabs: Tab[]
  activeId: string | null
  open: (sectionId: string, leafId: string) => void
  activate: (id: string) => void
  close: (id: string) => void
  closeOthers: (id: string) => void
  cycle: (delta: number) => void
}

const initial = makeTab('workloads', 'pods')

export const useTabs = create<TabState>((set) => ({
  tabs: [initial],
  activeId: initial.id,

  open: (sectionId, leafId) =>
    set((state) => {
      const tab = makeTab(sectionId, leafId)
      const exists = state.tabs.some((item) => item.id === tab.id)
      return { tabs: exists ? state.tabs : [...state.tabs, tab], activeId: tab.id }
    }),

  activate: (id) => set({ activeId: id }),

  close: (id) =>
    set((state) => {
      const index = state.tabs.findIndex((item) => item.id === id)
      if (index < 0) return state
      const tabs = state.tabs.filter((item) => item.id !== id)
      if (state.activeId !== id) return { tabs, activeId: state.activeId }
      return { tabs, activeId: tabs[Math.min(index, tabs.length - 1)]?.id ?? null }
    }),

  closeOthers: (id) =>
    set((state) => ({ tabs: state.tabs.filter((item) => item.id === id), activeId: id })),

  cycle: (delta) =>
    set((state) => {
      if (state.tabs.length === 0) return state
      const index = state.tabs.findIndex((item) => item.id === state.activeId)
      const next = (index + delta + state.tabs.length) % state.tabs.length
      return { activeId: state.tabs[next].id }
    }),
}))

export const activeTab = (state: TabState): Tab | null =>
  state.tabs.find((tab) => tab.id === state.activeId) ?? null
