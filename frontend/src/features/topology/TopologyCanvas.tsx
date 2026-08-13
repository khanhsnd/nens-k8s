import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { TopologyCard } from './TopologyCard'
import { workloadKey } from './topology.model'
import {
  NODE_HEIGHT,
  NODE_WIDTH,
  type EdgeKind,
  type GraphEdge,
  type Layout,
  type Placed,
} from './topology.types'

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2
const PADDING = 32

const DASHES: Record<EdgeKind, string | undefined> = {
  route: undefined,
  select: '5 4',
  owns: undefined,
  runs: '2 5',
}

const LEGEND: Array<[EdgeKind, string]> = [
  ['route', 'Ingress routes to a Service'],
  ['select', 'Service selects a workload'],
  ['owns', 'Workload owns a Pod'],
  ['runs', 'Scheduled on a Node — on hover'],
]

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

function path(from: Placed, to: Placed): string {
  const x1 = from.x + NODE_WIDTH
  const y1 = from.y + NODE_HEIGHT / 2
  const x2 = to.x
  const y2 = to.y + NODE_HEIGHT / 2
  const bend = Math.max(36, (x2 - x1) / 2)
  return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`
}

function Edge({ edge, from, to, hot, dim }: {
  edge: GraphEdge
  from: Placed
  to: Placed
  hot: boolean
  dim: boolean
}) {
  return (
    <g className={cn('transition-opacity', dim && 'opacity-10')}>
      <path
        d={path(from, to)}
        fill="none"
        strokeWidth={hot ? 1.75 : 1.25}
        strokeDasharray={DASHES[edge.kind]}
        markerEnd={`url(#${hot ? 'topo-arrow-hot' : 'topo-arrow'})`}
        className={hot ? 'stroke-accent' : 'stroke-line-strong'}
      />
      {hot && edge.label && (
        <text
          x={(from.x + NODE_WIDTH + to.x) / 2}
          y={(from.y + to.y) / 2 + NODE_HEIGHT / 2 - 5}
          textAnchor="middle"
          className="fill-accent text-2xs"
        >
          {edge.label}
        </text>
      )}
    </g>
  )
}

/**
 * Pan and zoom are one transform on one wrapper, so the lanes, the curves and the
 * cards can be three layers that never have to agree on a coordinate system.
 */
export function TopologyCanvas({
  layout,
  selectedId,
  matched,
  expanded,
  onSelect,
  onExpand,
}: {
  layout: Layout
  selectedId: string | null
  /** Ids the search matched, or null when nothing is being searched. */
  matched: Set<string> | null
  expanded: Record<string, boolean>
  onSelect: (node: Placed) => void
  onExpand: (node: Placed) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const fitted = useRef(false)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string | null>(null)

  const zoom = useCallback((factor: number, at?: { x: number; y: number }) => {
    const box = surface.current?.getBoundingClientRect()
    const point = at ?? { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2 }

    setView((current) => {
      const k = clamp(current.k * factor, MIN_ZOOM, MAX_ZOOM)
      const scale = k / current.k
      return { k, x: point.x - (point.x - current.x) * scale, y: point.y - (point.y - current.y) * scale }
    })
  }, [])

  // Fitting both axes of a tall graph lands at a zoom nothing can be read at, and
  // the axis that carries the meaning is the horizontal one: fit that, and let a
  // stack of namespace lanes be scrolled through like any other list.
  const fit = useCallback(() => {
    const box = surface.current?.getBoundingClientRect()
    if (!box || layout.width === 0) return

    const k = clamp(Math.min((box.width - PADDING) / layout.width, 1), MIN_ZOOM, MAX_ZOOM)
    const spare = box.height - layout.height * k
    setView({ k, x: (box.width - layout.width * k) / 2, y: spare > PADDING ? spare / 2 : PADDING / 2 })
  }, [layout.width, layout.height])

  // Fitting on every layout change would yank the canvas whenever a workload is
  // expanded, so it happens once per graph that arrives, and on demand after.
  useEffect(() => {
    if (layout.nodes.length === 0) {
      fitted.current = false
      return
    }
    if (fitted.current) return
    fitted.current = true
    fit()
  }, [layout.nodes.length, fit])

  // React's own wheel handler is passive, and a canvas that zooms must be able to
  // say the page is not scrolling.
  useEffect(() => {
    const element = surface.current
    if (!element) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const box = element.getBoundingClientRect()
      zoom(Math.exp(-event.deltaY * 0.0015), {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      })
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoom])

  const placed = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout.nodes])

  // A selection made elsewhere — a table row, or a namespace since gone out of
  // scope — is not in this graph, and focusing on nothing would dim everything.
  const focus = hovered ?? (selectedId && placed.has(selectedId) ? selectedId : null)
  const related = useMemo(() => {
    if (!focus) return null

    const nodes = new Set([focus])
    const edges = new Set<string>()
    for (const edge of layout.edges) {
      if (edge.from !== focus && edge.to !== focus) continue
      nodes.add(edge.from)
      nodes.add(edge.to)
      edges.add(edge.id)
    }
    return { nodes, edges }
  }, [focus, layout.edges])

  const dimmed = (id: string) =>
    (matched !== null && !matched.has(id)) || (related !== null && !related.nodes.has(id))

  const onCard = (event: { target: EventTarget | null }) =>
    Boolean((event.target as HTMLElement | null)?.closest('[data-card]'))

  function onPointerDown(event: React.PointerEvent) {
    if (onCard(event)) return

    const start = { x: event.clientX - view.x, y: event.clientY - view.y }
    const move = (moved: PointerEvent) =>
      setView((current) => ({ ...current, x: moved.clientX - start.x, y: moved.clientY - start.y }))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={surface}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => !onCard(event) && fit()}
      className="relative min-h-0 flex-1 cursor-grab overflow-hidden bg-base active:cursor-grabbing"
    >
      <div
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: '0 0',
        }}
        className="absolute left-0 top-0"
      >
        {layout.lanes.map((lane) => (
          <div
            key={lane.id}
            style={{ top: lane.y, height: lane.height, width: layout.width }}
            className="absolute left-0 rounded-panel border border-dashed border-line bg-surface/40"
          >
            <span className="absolute left-3 top-1 text-2xs uppercase tracking-wide text-faint">
              {lane.label}
            </span>
          </div>
        ))}

        {layout.columns.map((column) => (
          <div
            key={column.layer}
            style={{ left: column.x, width: NODE_WIDTH, top: 4 }}
            className="absolute text-center text-2xs font-semibold uppercase tracking-wide text-faint"
          >
            {column.label}
          </div>
        ))}

        <svg
          width={layout.width}
          height={layout.height}
          className="pointer-events-none absolute left-0 top-0"
        >
          <defs>
            <marker
              id="topo-arrow"
              viewBox="0 0 8 8"
              refX="8"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" className="fill-line-strong" />
            </marker>
            <marker
              id="topo-arrow-hot"
              viewBox="0 0 8 8"
              refX="8"
              refY="4"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" className="fill-accent" />
            </marker>
          </defs>

          {layout.edges.map((edge) => {
            const from = placed.get(edge.from)
            const to = placed.get(edge.to)
            if (!from || !to) return null

            const hot = related?.edges.has(edge.id) ?? false
            // Placement is what turns the picture into a hairball, so it is drawn
            // only for whatever is being looked at.
            if (edge.kind === 'runs' && !hot) return null

            return (
              <Edge
                key={edge.id}
                edge={edge}
                from={from}
                to={to}
                hot={hot}
                dim={!hot && (related !== null || matched !== null)}
              />
            )
          })}
        </svg>

        {layout.nodes.map((node) => (
          <TopologyCard
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            expanded={Boolean(expanded[workloadKey(node)])}
            dim={dimmed(node.id)}
            onSelect={() => onSelect(node)}
            onExpand={() => onExpand(node)}
            onHover={setHovered}
          />
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-panel border border-line bg-surface/90 px-3 py-2 text-2xs text-faint backdrop-blur">
        {LEGEND.map(([kind, label]) => (
          <div key={kind} className="flex items-center gap-2 py-0.5">
            <svg width="26" height="6" className="shrink-0">
              <line
                x1="0"
                y1="3"
                x2="26"
                y2="3"
                strokeWidth="1.5"
                strokeDasharray={DASHES[kind]}
                className="stroke-line-strong"
              />
            </svg>
            {label}
          </div>
        ))}
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-panel border border-line bg-surface/90 p-1 backdrop-blur">
        <button
          title="Zoom out"
          onClick={() => zoom(1 / 1.25)}
          className="grid size-7 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <ZoomOut className="size-4" />
        </button>
        <span className="w-10 text-center text-2xs tabular-nums text-faint">
          {Math.round(view.k * 100)}%
        </span>
        <button
          title="Zoom in"
          onClick={() => zoom(1.25)}
          className="grid size-7 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <ZoomIn className="size-4" />
        </button>
        <span className="mx-0.5 h-4 w-px bg-line" />
        <button
          title="Fit to width — double-clicking the background does the same"
          onClick={fit}
          className="grid size-7 place-items-center rounded text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
    </div>
  )
}
