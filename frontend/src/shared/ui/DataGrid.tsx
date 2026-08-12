import { useVirtualizer } from '@tanstack/react-virtual'
import { MoreHorizontal } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/shared/lib/cn'
import { ColumnMenu } from './ColumnMenu'
import { useGridLayout } from './grid.layout'
import { useGridSelection, type Rect } from './grid.selection'

export type Column<T> = {
  key: string
  label: string
  min: number
  grow: number
  text: (row: T) => string
  cell?: (row: T) => ReactNode
  header?: ReactNode
  fixed?: boolean
  hidden?: boolean
}

const ROW_HEIGHT = 30
const ACTIONS_WIDTH = 36
const ROW_ACTIONS_WIDTH = 76
const AUTOSCROLL_EDGE = 28
const AUTOSCROLL_SPEED = 12
const REORDER_THRESHOLD = 6

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
  layoutId,
  rows,
  columns,
  rowKey,
  activeKey,
  onActivate,
  rowActions,
}: {
  layoutId: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  activeKey?: string | null
  onActivate?: (row: T) => void
  /** Fills the sticky last cell instead of the open-details button. */
  rowActions?: (row: T) => ReactNode
}) {
  const actionsWidth = rowActions ? ROW_ACTIONS_WIDTH : ACTIONS_WIDTH
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const endDrag = useRef(() => {})

  const layout = useGridLayout(layoutId, columns)
  const [resizing, setResizing] = useState<{ key: string; width: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const visible = layout.visible
  const widthOf = (column: Column<T>) =>
    resizing?.key === column.key ? resizing.width : layout.widths[column.key]
  const trackOf = (column: Column<T>) => {
    const width = widthOf(column)
    return width ? `${width}px` : `minmax(${column.min}px, ${column.grow}fr)`
  }

  const template = visible.map(trackOf).join(' ')
  const columnsWidth = visible.reduce((total, column) => total + (widthOf(column) || column.min), 0)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const { rect, focus, goTo, extendTo, selectColumn, onKeyDown } = useGridSelection({
    rowCount: rows.length,
    colCount: visible.length,
    getText: (r, c) => visible[c].text(rows[r]),
    onActivate: (r) => onActivate?.(rows[r]),
    onReveal: (r) => virtualizer.scrollToIndex(r),
  })

  const startReorder = (column: Column<T>, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return

    const start = event.clientX
    const targetAt = (at: PointerEvent) => {
      if (Math.abs(at.clientX - start) < REORDER_THRESHOLD) return null
      const target = document
        .elementFromPoint(at.clientX, at.clientY)
        ?.closest<HTMLElement>('[data-column]')?.dataset.column
      return target && target !== column.key ? target : null
    }

    const onMove = (move: PointerEvent) => setDropTarget(targetAt(move))
    const onUp = (up: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const target = targetAt(up)
      setDropTarget(null)
      if (target) layout.move(column.key, target)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startResize = (column: Column<T>, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const start = event.clientX
    const from = event.currentTarget.parentElement?.getBoundingClientRect().width ?? column.min
    const widthAt = (x: number) => Math.max(column.min, Math.round(from + x - start))

    const onMove = (move: PointerEvent) =>
      setResizing({ key: column.key, width: widthAt(move.clientX) })
    const onUp = (up: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setResizing(null)
      layout.resize(column.key, widthAt(up.clientX))
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

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
      <div className="flex shrink-0 overflow-hidden border-b border-line bg-surface [scrollbar-gutter:stable]">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div
            ref={headerRef}
            style={{ gridTemplateColumns: template, minWidth: columnsWidth }}
            className="grid"
          >
            {visible.map((column, c) => (
              <div
                key={column.key}
                data-column={column.key}
                className={cn(
                  'relative flex border-r border-line/60',
                  c >= rect.left && c <= rect.right
                    ? 'bg-accent-dim text-accent'
                    : 'text-faint hover:bg-raised',
                  dropTarget === column.key && 'shadow-[inset_2px_0_0_0_var(--color-accent)]',
                )}
              >
                <button
                  title={column.label}
                  onPointerDown={(event) => {
                    selectColumn(c, event.shiftKey)
                    startReorder(column, event)
                  }}
                  className="min-w-0 flex-1 cursor-grab truncate px-3 py-2 text-left text-xs font-medium uppercase tracking-wide active:cursor-grabbing"
                >
                  {column.header ?? column.label}
                </button>

                <div
                  onPointerDown={(event) => startResize(column, event)}
                  onDoubleClick={() => layout.resize(column.key, 0)}
                  title="Drag to resize · double-click to auto-fit"
                  className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-accent/60"
                />
              </div>
            ))}
          </div>
        </div>

        <div
          style={{ width: actionsWidth }}
          className="grid shrink-0 place-items-center border-l border-line/60"
        >
          <ColumnMenu
            columns={layout.ordered}
            hidden={layout.hidden}
            onToggle={layout.toggle}
            onReset={layout.reset}
          />
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
        <div
          style={{ height: virtualizer.getTotalSize(), minWidth: columnsWidth + actionsWidth }}
          className="relative"
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (!row) return null

            const background =
              rowKey(row) === activeKey
                ? 'bg-accent-dim'
                : item.index >= rect.top && item.index <= rect.bottom
                  ? 'bg-raised'
                  : 'bg-base'

            return (
              <div
                key={rowKey(row)}
                role="row"
                style={{
                  transform: `translateY(${item.start}px)`,
                  height: ROW_HEIGHT,
                  gridTemplateColumns: `${template} ${actionsWidth}px`,
                  minWidth: columnsWidth + actionsWidth,
                }}
                className={cn(
                  'absolute inset-x-0 top-0 grid items-stretch border-b border-line/40 text-sm',
                  background,
                )}
              >
                {visible.map((column, c) => {
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
                        boxShadow: inRange ? edgeShadow(item.index, c, rect, focused) : undefined,
                      }}
                      className={cn(
                        'flex cursor-cell items-center border-r border-line/40 px-3 text-muted',
                        inRange && !focused && 'bg-accent-dim',
                      )}
                    >
                      {/* The cell centres its content with flexbox rather than a row-height
                          line-height: a bordered chip that inherited 30px of leading grew taller
                          than the row it sits in, and a block-level cell renderer hugged its top. */}
                      <span className="min-w-0 flex-1 truncate">
                        {column.cell ? column.cell(row) : column.text(row)}
                      </span>
                    </div>
                  )
                })}

                <div
                  className={cn(
                    'sticky right-0 flex items-center justify-center gap-1 border-l border-line/40',
                    background,
                  )}
                >
                  {rowActions
                    ? rowActions(row)
                    : onActivate && (
                        <button
                          onClick={() => onActivate(row)}
                          title="Open details"
                          className="grid size-6 place-items-center rounded text-faint transition-colors hover:bg-overlay hover:text-text"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-surface px-4 py-1.5 text-xs text-faint">
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
