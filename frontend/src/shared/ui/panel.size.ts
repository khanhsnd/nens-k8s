import { useCallback } from 'react'
import { create } from 'zustand'
import { load, save } from '@/shared/lib/persist'

const KEY = 'panels'

type PanelState = {
  sizes: Record<string, number>
  resize: (id: string, size: number) => void
}

const usePanels = create<PanelState>((set) => ({
  sizes: load<Record<string, number>>(KEY, {}),

  resize: (id, size) =>
    set((state) => {
      const sizes = { ...state.sizes, [id]: size }
      save(KEY, sizes)
      return { sizes }
    }),
}))

export type PanelBounds = { initial: number; min: number; max: number }

/** One persisted size per panel id, clamped on the way in and on the way out. */
export function usePanelSize(id: string, { initial, min, max }: PanelBounds) {
  const size = usePanels((state) => state.sizes[id] ?? initial)
  const resize = usePanels((state) => state.resize)

  const clamp = (value: number) => Math.min(max, Math.max(min, value))

  return [
    clamp(size),
    useCallback((next: number) => resize(id, clamp(next)), [id, min, max, resize]),
  ] as const
}
