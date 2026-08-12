import { Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { AddClusterDialog } from '@/features/clusters/AddClusterDialog'
import { useClusters } from '@/features/clusters/cluster.store'
import type { Cluster, ClusterPhase } from '@/features/clusters/cluster.types'
import { cn } from '@/shared/lib/cn'
import { Tooltip } from '@/shared/ui/Tooltip'

const PHASE_RING: Record<ClusterPhase, string> = {
  connected: 'ring-ok/70',
  connecting: 'ring-warn/70 animate-pulse',
  error: 'ring-danger/70',
  disconnected: 'ring-transparent',
}

function initials(name: string) {
  return name
    .split(/[-_.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function ClusterAvatar({ cluster, active }: { cluster: Cluster; active: boolean }) {
  const activate = useClusters((s) => s.activate)

  return (
    <Tooltip
      label={
        <div className="space-y-0.5">
          <div className="font-medium">{cluster.name}</div>
          <div className="text-faint">{cluster.server}</div>
        </div>
      }
    >
      <button
        onClick={() => void activate(cluster.id)}
        className={cn(
          'relative grid size-9 place-items-center rounded-[10px] text-[11px] font-semibold ring-2 transition-all',
          PHASE_RING[cluster.phase],
          active
            ? 'bg-accent text-base'
            : 'bg-raised text-muted hover:bg-overlay hover:text-text',
        )}
      >
        {initials(cluster.name)}
        {active && (
          <span className="absolute -left-[11px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent" />
        )}
      </button>
    </Tooltip>
  )
}

export function ClusterRail() {
  const clusters = useClusters((s) => s.clusters)
  const activeId = useClusters((s) => s.activeId)
  const [adding, setAdding] = useState(false)

  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-line bg-base py-3">
      {clusters.map((cluster) => (
        <ClusterAvatar key={cluster.id} cluster={cluster} active={cluster.id === activeId} />
      ))}

      <Tooltip label="Add kubeconfig">
        <button
          onClick={() => setAdding(true)}
          className="grid size-9 place-items-center rounded-[10px] border border-dashed border-line-strong text-faint transition-colors hover:border-accent hover:text-accent"
        >
          <Plus className="size-4" />
        </button>
      </Tooltip>

      <AddClusterDialog open={adding} onClose={() => setAdding(false)} />

      <div className="mt-auto">
        <Tooltip label="Preferences">
          <button className="grid size-9 place-items-center rounded-[10px] text-faint transition-colors hover:bg-raised hover:text-text">
            <Settings className="size-4" />
          </button>
        </Tooltip>
      </div>
    </nav>
  )
}
