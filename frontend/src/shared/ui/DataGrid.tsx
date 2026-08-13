import { useVirtualizer } from '@tanstack/react-virtual'
import { MoreHorizontal } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
const CHECK_WIDTH = 32
/** Under this much pointer movement a press is a click, not a range drag. */
const CLICK_SLOP = 4
const AUTOSCROLL_EDGE = 28
const AUTOSCROLL_SPEED = 12
const REORDER_THRESHOLD = 6

function Tick({
  checked,
  partial,
  title,
  onChange,
}: {
  checked: boolean
  partial?: boolean
  title: string
  onChange: () => void
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      title={title}
      // `indeterminate` is a property, never an attribute.
      ref={(node) => {
        if (node) node.indeterminate = Boolean(partial) && !checked
      }}
      onChange={onChange}
      onPointerDown={(event) => event.stopPropagation()}
      className="size-3.5 cursor-pointer accent-accent"
    />
  )
}

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

/** Tick boxes for a bulk action: the view owns what the action is. */
export type GridPicks = {
  keys: Set<string>
  onChange: (keys: Set<string>) => void
}

export function DataGrid<T>({
  layoutId,
  rows,
  columns,
  rowKey,
  activeKey,
  onActivate,
  rowActions,
  picks,
}: {
  layoutId: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  activeKey?: string | null
  onActivate?: (row: T) => void
  /** Fills the sticky last cell instead of the open-details button. */
  rowActions?: (row: T) => ReactNode
  picks?: GridPicks
}) {
  const actionsWidth = rowActions ? ROW_ACTIONS_WIDTH : ACTIONS_WIDTH
  const checkWidth = picks ? CHECK_WIDTH : 0
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
  // Columns only: the tick and actions tracks are added where the whole row is
  // measured, and the header's track area must not count them.
  const columnsWidth = visible.reduce((total, column) => total + (widthOf(column) || column.min), 0)
  const rowWidth = checkWidth + columnsWidth + actionsWidth

  const pickedHere = picks ? rows.filter((row) => picks.keys.has(rowKey(row))).length : 0
  const allPicked = pickedHere > 0 && pickedHere === rows.length

  const togglePick = (key: string) => {
    if (!picks) return

    const next = new Set(picks.keys)
    if (!next.delete(key)) next.add(key)
    picks.onChange(next)
  }

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

  /**
   * A press that does not travel is a click: it selects the cell, tints the row
   * and opens the detail panel. Waiting for the release is what keeps the range
   * drag — the panel must not open under a pointer that is still selecting.
   */
  const armActivate = useCallback(
    (row: T) => {
      if (!onActivate) return

      const from = { ...pointer.current }
      const onUp = (up: PointerEvent) => {
        window.removeEventListener('pointerup', onUp)
        const travelled = Math.abs(up.clientX - from.x) + Math.abs(up.clientY - from.y)
        if (travelled < CLICK_SLOP) onActivate(row)
      }
      window.addEventListener('pointerup', onUp)
    },
    [onActivate],
  )

  useEffect(() => () => endDrag.current(), [])

  // The header's offset is imperative — a scroll must not re-render 5k rows — so
  // it has to be re-applied after every render: a render that replaces the header
  // node (or its style) leaves a scrolled body under an unscrolled header.
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    if (scroller && headerRef.current) {
      headerRef.current.style.transform = `translateX(${-scroller.scrollLeft}px)`
    }
  })

  const selectedRows = rect.bottom - rect.top + 1
  const selectedCols = rect.right - rect.left + 1

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-base">
      <div className="flex shrink-0 overflow-hidden border-b border-line bg-surface [scrollbar-gutter:stable]">
        {picks && (
          <div
            style={{ width: checkWidth }}
            className="grid shrink-0 place-items-center border-r border-line/60"
          >
            <Tick
              checked={allPicked}
              partial={pickedHere > 0}
              title={allPicked ? 'Clear the selection' : 'Select every row in view'}
              onChange={() => picks.onChange(allPicked ? new Set() : new Set(rows.map(rowKey)))}
            />
          </div>
        )}

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
          style={{ height: virtualizer.getTotalSize(), minWidth: rowWidth }}
          className="relative"
        >
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index]
            if (!row) return null

            const key = rowKey(row)
            const active = key === activeKey
            const background = active
              ? 'bg-accent-dim'
              : item.index >= rect.top && item.index <= rect.bottom
                ? 'bg-raised'
                : 'bg-base'

            return (
              <div
                key={key}
                role="row"
                style={{
                  transform: `translateY(${item.start}px)`,
                  height: ROW_HEIGHT,
                  gridTemplateColumns: `${checkWidth ? `${checkWidth}px ` : ''}${template} ${actionsWidth}px`,
                  minWidth: rowWidth,
                }}
                className={cn(
                  'group/row absolute inset-x-0 top-0 grid items-stretch border-b border-line/40 text-sm',
                  background,
                  // The hover tint has to be the row's, not the cell's: a cell-level
                  // hover would leave the sticky ends behind as the pointer moves.
                  !active && 'hover:bg-raised',
                )}
              >
                {picks && (
                  <div
                    style={{ left: 0 }}
                    className={cn(
                      'sticky z-10 grid place-items-center border-r border-line/40',
                      background,
                      !active && 'group-hover/row:bg-raised',
                    )}
                  >
                    <Tick
                      checked={picks.keys.has(key)}
                      title="Select this row"
                      onChange={() => togglePick(key)}
                    />
                  </div>
                )}
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
                        if (!event.shiftKey) armActivate(row)
                      }}
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
                    !active && 'group-hover/row:bg-raised',
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
        {pickedHere > 0 && <span className="font-medium text-accent">{pickedHere} ticked</span>}
        {(selectedRows > 1 || selectedCols > 1) && (
          <span className="text-muted">
            {selectedRows}R × {selectedCols}C
          </span>
        )}
        <span className="ml-auto">Click to open · Drag to select · Ctrl+C copy</span>
      </div>
    </div>
  )
}
