import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { copyText } from '@/shared/lib/clipboard'

export type Cell = { r: number; c: number }
export type Rect = { top: number; bottom: number; left: number; right: number }

const PAGE = 20

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value))

export function useGridSelection({
  rowCount,
  colCount,
  getText,
  onActivate,
  onReveal,
}: {
  rowCount: number
  colCount: number
  getText: (r: number, c: number) => string
  onActivate?: (r: number) => void
  onReveal?: (r: number) => void
}) {
  const [anchor, setAnchor] = useState<Cell>({ r: 0, c: 0 })
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 })
  const focusRef = useRef(focus)

  const rect = useMemo<Rect>(
    () => ({
      top: clamp(Math.min(anchor.r, focus.r), rowCount - 1),
      bottom: clamp(Math.max(anchor.r, focus.r), rowCount - 1),
      left: clamp(Math.min(anchor.c, focus.c), colCount - 1),
      right: clamp(Math.max(anchor.c, focus.c), colCount - 1),
    }),
    [anchor, focus, rowCount, colCount],
  )

  const apply = useCallback(
    (cell: Cell, extend: boolean, reveal: boolean) => {
      const next = { r: clamp(cell.r, rowCount - 1), c: clamp(cell.c, colCount - 1) }
      focusRef.current = next
      setFocus((prev) => (prev.r === next.r && prev.c === next.c ? prev : next))
      if (!extend) setAnchor(next)
      if (reveal) onReveal?.(next.r)
    },
    [rowCount, colCount, onReveal],
  )

  const goTo = useCallback((cell: Cell, extend: boolean) => apply(cell, extend, true), [apply])
  const extendTo = useCallback((cell: Cell) => apply(cell, true, false), [apply])

  const selectColumn = useCallback(
    (c: number, extend: boolean) => {
      focusRef.current = { r: rowCount - 1, c }
      setAnchor((prev) => ({ r: 0, c: extend ? prev.c : c }))
      setFocus(focusRef.current)
    },
    [rowCount],
  )

  const copy = useCallback(() => {
    const lines: string[] = []
    for (let r = rect.top; r <= rect.bottom; r += 1) {
      const cells: string[] = []
      for (let c = rect.left; c <= rect.right; c += 1) cells.push(getText(r, c))
      lines.push(cells.join('\t'))
    }
    void copyText(lines.join('\n'))
  }, [rect, getText])

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey
      const extend = event.shiftKey
      const last = { r: rowCount - 1, c: colCount - 1 }
      const at = focusRef.current

      switch (event.key) {
        case 'ArrowUp':
          goTo({ r: at.r - 1, c: at.c }, extend)
          break
        case 'ArrowDown':
          goTo({ r: at.r + 1, c: at.c }, extend)
          break
        case 'ArrowLeft':
          goTo({ r: at.r, c: at.c - 1 }, extend)
          break
        case 'ArrowRight':
          goTo({ r: at.r, c: at.c + 1 }, extend)
          break
        case 'PageUp':
          goTo({ r: at.r - PAGE, c: at.c }, extend)
          break
        case 'PageDown':
          goTo({ r: at.r + PAGE, c: at.c }, extend)
          break
        case 'Home':
          goTo(mod ? { r: 0, c: 0 } : { r: at.r, c: 0 }, extend)
          break
        case 'End':
          goTo(mod ? last : { r: at.r, c: last.c }, extend)
          break
        case 'Escape':
          goTo(at, false)
          break
        case 'Enter':
          onActivate?.(at.r)
          break
        case 'a':
        case 'A':
          if (!mod) return
          setAnchor({ r: 0, c: 0 })
          focusRef.current = last
          setFocus(last)
          break
        case 'c':
        case 'C':
          if (!mod) return
          copy()
          break
        default:
          return
      }
      event.preventDefault()
    },
    [rowCount, colCount, goTo, copy, onActivate],
  )

  return { rect, focus, goTo, extendTo, selectColumn, copy, onKeyDown }
}
