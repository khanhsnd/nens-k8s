import {
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  Database,
  Globe,
  Hourglass,
  LayoutGrid,
  Layers,
  Network,
  Server,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/shared/lib/cn'
import { Dot, FILLS, TINTS, TONES } from '@/shared/ui/Badge'
import { NODE_HEIGHT, NODE_WIDTH, type Placed } from './topology.types'

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Ingress: Globe,
  Service: Network,
  Deployment: Layers,
  StatefulSet: Database,
  DaemonSet: LayoutGrid,
  Job: Hourglass,
  Pod: Box,
  Node: Server,
}

export function TopologyCard({
  node,
  selected,
  expanded,
  dim,
  onSelect,
  onExpand,
  onHover,
}: {
  node: Placed
  selected: boolean
  expanded: boolean
  dim: boolean
  onSelect: () => void
  onExpand: () => void
  onHover: (id: string | null) => void
}) {
  const Icon = ICONS[node.kind] ?? Boxes
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div
      data-card
      style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
      onClick={onSelect}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'absolute flex cursor-pointer items-center gap-2 overflow-hidden rounded-panel border bg-surface pl-3 pr-1.5 shadow-sm transition-opacity',
        selected ? 'border-accent shadow-lg' : 'border-line hover:border-line-strong',
        dim && 'opacity-20',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-[3px]', FILLS[node.tone])} />

      <span className={cn('grid size-7 shrink-0 place-items-center rounded-md border', TINTS[node.tone])}>
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" title={node.name}>
          {node.name}
        </div>
        <div className="truncate text-2xs text-faint">
          {node.kind}
          {node.namespace && ` · ${node.namespace}`}
        </div>
        <div className="flex items-center gap-1 text-2xs">
          <Dot tone={node.tone} />
          <span className={cn('shrink-0', TONES[node.tone])}>{node.status}</span>
          {node.stats.length > 0 && (
            <span className="truncate text-faint" title={node.stats.join(' · ')}>
              · {node.stats.join(' · ')}
            </span>
          )}
        </div>
      </div>

      {node.expandable && (
        <button
          title={expanded ? 'Fold the pods back in' : `Show the ${node.pods} pods`}
          onClick={(event) => {
            event.stopPropagation()
            onExpand()
          }}
          className="flex shrink-0 items-center gap-0.5 self-stretch rounded px-1 text-2xs text-faint transition-colors hover:bg-raised hover:text-accent"
        >
          {node.pods}
          <Chevron className="size-3.5" />
        </button>
      )}
    </div>
  )
}
