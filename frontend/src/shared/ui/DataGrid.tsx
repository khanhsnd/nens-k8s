import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { useGridSelection, type Rect } from './grid.selection'

export type Column<T> = {
  key: string
  label: string
  min: number
  grow: number
  text: (row: T) => string
  cell?: (row: T) => ReactNode
}

const ROW_HEIGHT = 30
const AUTOSCROLL_EDGE = 28
const AUTOSCROLL_SPEED = 12

function edgeShadow(r: number, c: number, rect: Rect, focused: boolean): string | undefined {
  const shadows = [
    r === rect.top && 'inset 0 1px 0 0 var(--color-accent)',
    r === rect.bottom && 'inset 0 -1px 0 0 var(--color-accent)',
    c === rect.left && 'inset 1px 0 0 0 var(--color-accent)',
    c === rect.right && 'inset -1px 0 0 0 var(--color-accent)',
    focused && 'inset 0 0 0 1px var(--color-accent)',
  ].filter(Boolean)
  return shadows.length > 0 ? shadows.join(', ') : undefined
}

export function DataGrid<T>({
  rows,
  columns,
  rowKey,
  activeKey,
  onActivate,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  activeKey?: string | null
  onActivate?: (row: T) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const endDrag = useRef(() => {})

  const template = columns.map((column) => `minmax(${column.min}px, ${column.grow}fr)`).join(' ')
  const minWidth = columns.reduce((total, column) => total + column.min, 0)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const { rect, focus, goTo, extendTo, selectColumn, onKeyDown } = useGridSelection({
    rowCount: rows.length,
    colCount: columns.length,
    getText: (r, c) => columns[c].text(rows[r]),
    onActivate: (r) => onActivate?.(rows[r]),
    onReveal: (r) => virtualizer.scrollToIndex(r),
  })

  const cellAtPointer = useCallback(() => {
    const element = document.elementFromPoint(pointer.current.x, pointer.current.y)
    const cell = element?.closest<HTMLElement>('[data-cell]')
    if (!cell?.dataset.r || !cell.dataset.c) return null
    return { r: Number(cell.dataset.r), c: Number(cell.dataset.c) }
  }, [])

  const startDrag = useCallback(() => {
    endDrag.current()

    const extendAt = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY }
      const cell = cellAtPointer()
      if (cell) extendTo(cell)
    }
    const track = (event: PointerEvent) => {
      if (event.buttons === 0) return stop()
      extendAt(event)
    }
    const release = (event: PointerEvent) => {
      extendAt(event)
      stop()
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', track)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('blur', stop)
      endDrag.current = () => {}
    }

    let frame = requestAnimationFrame(function tick() {
      const scroller = scrollRef.current
      if (scroller) {
        const box = scroller.getBoundingClientRect()
        const above = box.top + AUTOSCROLL_EDGE - pointer.current.y
        const below = pointer.current.y - (box.bottom - AUTOSCROLL_EDGE)
        if (above > 0) scroller.scrollTop -= AUTOSCROLL_SPEED
        else if (below > 0) scroller.scrollTop += AUTOSCROLL_SPEED
      }

      const cell = cellAtPointer()
      if (cell) extendTo(cell)
      frame = requestAnimationFrame(tick)
    })

    window.addEventListener('pointermove', track)
    window.addEventListener('pointerup', release)
    window.addEventListener('blur', stop)
    endDrag.current = stop
  }, [cellAtPointer, extendTo])

  useEffect(() => () => endDrag.current(), [])

  const selectedRows = rect.bottom - rect.top + 1
  const selectedCols = rect.right - rect.left + 1

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <div className="shrink-0 overflow-hidden border-b border-line bg-surface [scrollbar-gutter:stable]">
        <div ref={headerRef} style={{ gridTemplateColumns: template, minWidth }} className="grid">
          {columns.map((column, c) => (
            <button
              key={column.key}
              onPointerDown={(event) => selectColumn(c, event.shiftKey)}
              className={cn(
                'truncate border-r border-line/60 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide',
                c >= rect.left && c <= rect.right
                  ? 'bg-accent-dim text-accent'
                  : 'text-faint hover:bg-raised',
              )}
            >
              {column.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        role="grid"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          const { scrollLeft } = event.currentTarget
          if (headerRef.current) headerRef.current.style.transform = `translateX(${-scrollLeft}px)`
        }}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-scroll outline-none [scrollbar-gutter:stable]"
      >
        <div style={{ height: virtualizer.getTotalSize(), minWidth }} className="relative">
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (!row) return null

            return (
              <div
                key={rowKey(row)}
                role="row"
                style={{
                  transform: `translateY(${item.start}px)`,
                  height: ROW_HEIGHT,
                  gridTemplateColumns: template,
                  minWidth,
                }}
                className={cn(
                  'absolute inset-x-0 top-0 grid items-stretch border-b border-line/40 text-[12.5px]',
                  rowKey(row) === activeKey && 'bg-raised',
                )}
              >
                {columns.map((column, c) => {
                  const inRange =
                    item.index >= rect.top &&
                    item.index <= rect.bottom &&
                    c >= rect.left &&
                    c <= rect.right
                  const focused = item.index === focus.r && c === focus.c

                  return (
                    <div
                      key={column.key}
                      role="gridcell"
                      aria-selected={inRange}
                      data-cell
                      data-r={item.index}
                      data-c={c}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return
                        pointer.current = { x: event.clientX, y: event.clientY }
                        goTo({ r: item.index, c }, event.shiftKey)
                        startDrag()
                      }}
                      onDoubleClick={() => onActivate?.(row)}
                      style={{
                        lineHeight: `${ROW_HEIGHT}px`,
                        boxShadow: inRange ? edgeShadow(item.index, c, rect, focused) : undefined,
                      }}
                      className={cn(
                        'cursor-cell truncate border-r border-line/40 px-3 text-muted',
                        inRange && !focused && 'bg-accent-dim',
                      )}
                    >
                      {column.cell ? column.cell(row) : column.text(row)}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-4 py-1.5 text-[11px] text-faint">
        <span>{rows.length} items</span>
        {(selectedRows > 1 || selectedCols > 1) && (
          <span className="text-muted">
            {selectedRows}R × {selectedCols}C
          </span>
        )}
        <span className="ml-auto">Drag to select · Ctrl+C copy · Enter open</span>
      </div>
    </div>
  )
}
