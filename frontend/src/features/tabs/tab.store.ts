import { create } from 'zustand'
import { NAV_SECTIONS } from '@/features/navigation/nav.model'
import { load, save } from '@/shared/lib/persist'

const KEY = 'tabs'

export type Tab = {
  id: string
  sectionId: string
  leafId: string
  title: string
}

type Opened = { sectionId: string; leafId: string }

/** Null for a leaf the nav model no longer has — a saved tab can outlive it. */
function makeTab(sectionId: string, leafId: string): Tab | null {
  const section = NAV_SECTIONS.find((item) => item.id === sectionId)
  const leaf = section?.children.find((item) => item.id === leafId)
  if (!leaf) return null

  return { id: `${sectionId}:${leafId}`, sectionId, leafId, title: leaf.label }
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

function reopen(): Pick<TabState, 'tabs' | 'activeId'> {
  const saved = load<{ tabs: Opened[]; activeId: string | null }>(KEY, { tabs: [], activeId: null })
  const tabs = saved.tabs
    .map((item) => makeTab(item.sectionId, item.leafId))
    .filter((tab): tab is Tab => tab !== null)

  if (tabs.length === 0) {
    const pods = makeTab('workloads', 'pods')!
    return { tabs: [pods], activeId: pods.id }
  }
  return {
    tabs,
    activeId: tabs.find((tab) => tab.id === saved.activeId)?.id ?? tabs[0].id,
  }
}

export const useTabs = create<TabState>((set) => ({
  ...reopen(),

  open: (sectionId, leafId) =>
    set((state) => {
      const tab = makeTab(sectionId, leafId)
      if (!tab) return state

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

// One subscription instead of a save call in every action: the open set is small
// and every mutation of it is worth keeping.
useTabs.subscribe(({ tabs, activeId }) =>
  save(KEY, {
    tabs: tabs.map(({ sectionId, leafId }) => ({ sectionId, leafId })),
    activeId,
  }),
)

export const activeTab = (state: TabState): Tab | null =>
  state.tabs.find((tab) => tab.id === state.activeId) ?? null
