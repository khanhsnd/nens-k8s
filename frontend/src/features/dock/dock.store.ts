import { create } from 'zustand'
import type { ResourceRef } from '@/features/resources/resource.types'

export type DockKind = 'logs'

export type DockTool = {
  id: string
  kind: DockKind
  title: string
  subtitle: string
  ref: ResourceRef
}

type DockState = {
  tools: DockTool[]
  activeId: string | null
  maximized: boolean
  open: (tool: DockTool) => void
  activate: (id: string) => void
  close: (id: string) => void
  toggleMaximized: () => void
}

export const useDock = create<DockState>((set) => ({
  tools: [],
  activeId: null,
  maximized: false,

  open: (tool) =>
    set((state) => ({
      tools: state.tools.some((item) => item.id === tool.id) ? state.tools : [...state.tools, tool],
      activeId: tool.id,
    })),

  activate: (id) => set({ activeId: id }),

  close: (id) =>
    set((state) => {
      const index = state.tools.findIndex((item) => item.id === id)
      if (index < 0) return state

      const tools = state.tools.filter((item) => item.id !== id)
      return {
        tools,
        activeId:
          state.activeId === id
            ? (tools[Math.min(index, tools.length - 1)]?.id ?? null)
            : state.activeId,
        maximized: tools.length > 0 && state.maximized,
      }
    }),

  toggleMaximized: () => set((state) => ({ maximized: !state.maximized })),
}))

export function openLogsTool(ref: ResourceRef) {
  useDock.getState().open({
    id: `logs:${ref.uid}`,
    kind: 'logs',
    title: ref.name,
    subtitle: ref.namespace,
    ref,
  })
}
