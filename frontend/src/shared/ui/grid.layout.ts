import { useMemo } from 'react'
import { create } from 'zustand'
import type { Column } from './DataGrid'

export type GridLayout = {
  order?: string[]
  hidden?: string[]
  widths?: Record<string, number>
}

const STORAGE_KEY = 'nens:grid-layouts'

function load(): Record<string, GridLayout> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function save(layouts: Record<string, GridLayout>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
  return { layouts }
}

type LayoutState = {
  layouts: Record<string, GridLayout>
  patch: (id: string, change: Partial<GridLayout>) => void
  reset: (id: string) => void
}

const useLayouts = create<LayoutState>((set) => ({
  layouts: load(),

  patch: (id, change) =>
    set((state) => save({ ...state.layouts, [id]: { ...state.layouts[id], ...change } })),

  reset: (id) =>
    set((state) => {
      const { [id]: _dropped, ...rest } = state.layouts
      return save(rest)
    }),
}))

function sortByOrder<T>(columns: Column<T>[], order?: string[]): Column<T>[] {
  if (!order?.length) return columns
  const rank = new Map(order.map((key, index) => [key, index]))
  return [...columns].sort((a, b) => (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity))
}

function moveKey<T>(columns: Column<T>[], key: string, target: string): string[] {
  const keys = columns.map((column) => column.key)
  const from = keys.indexOf(key)
  const to = keys.indexOf(target)
  if (from < 0 || to < 0 || from === to) return keys
  keys.splice(from, 1)
  keys.splice(to, 0, key)
  return keys
}

export function useGridLayout<T>(id: string, columns: Column<T>[]) {
  const layout = useLayouts((state) => state.layouts[id])
  const patch = useLayouts((state) => state.patch)
  const resetLayout = useLayouts((state) => state.reset)

  const ordered = useMemo(() => sortByOrder(columns, layout?.order), [columns, layout?.order])

  const hidden = useMemo(
    () =>
      new Set(
        layout?.hidden ??
          columns.filter((column) => column.hidden).map((column) => column.key),
      ),
    [columns, layout?.hidden],
  )

  const visible = useMemo(
    () => ordered.filter((column) => !hidden.has(column.key)),
    [ordered, hidden],
  )

  const widths = layout?.widths ?? {}

  return {
    ordered,
    visible,
    hidden,
    widths,
    toggle: (key: string) =>
      patch(id, {
        hidden: hidden.has(key)
          ? [...hidden].filter((item) => item !== key)
          : [...hidden, key],
      }),
    move: (key: string, target: string) => patch(id, { order: moveKey(ordered, key, target) }),
    resize: (key: string, width: number) => patch(id, { widths: { ...widths, [key]: width } }),
    reset: () => resetLayout(id),
  }
}
