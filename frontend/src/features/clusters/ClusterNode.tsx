import { ChevronRight, Plug, Settings2, Unplug, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNav } from '@/features/navigation/nav.store'
import { cn } from '@/shared/lib/cn'
import { Dot, type Tone } from '@/shared/ui/Badge'
import { Tooltip } from '@/shared/ui/Tooltip'
import { useClusters } from './cluster.store'
import { ClusterSettingsDialog } from './ClusterSettingsDialog'
import type { Cluster, ClusterPhase } from './cluster.types'

const PHASE: Record<ClusterPhase, { tone: Tone; label: string }> = {
  connected: { tone: 'ok', label: 'connected' },
  connecting: { tone: 'warn', label: 'connecting…' },
  error: { tone: 'danger', label: 'failed to connect' },
  disconnected: { tone: 'neutral', label: 'not connected' },
}

function initials(name: string) {
  return name
    .split(/[-_.\s]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function RowAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip label={label} side="top">
      <button
        aria-label={label}
        onClick={onClick}
        className="grid size-6 place-items-center rounded text-faint transition-colors hover:bg-overlay hover:text-text"
      >
        <Icon className="size-3.5" />
      </button>
    </Tooltip>
  )
}

/**
 * The row's actions float over its right edge instead of sitting in the flex flow:
 * reserving their width would shorten every cluster name for a control that is only
 * visible on hover, and `hidden` would take them out of the tab order.
 */
export function ClusterNode({ cluster, children }: { cluster: Cluster; children: ReactNode }) {
  const activeId = useClusters((s) => s.activeId)
  const activate = useClusters((s) => s.activate)
  const connect = useClusters((s) => s.connect)
  const disconnect = useClusters((s) => s.disconnect)
  const collapsed = useNav((s) => s.collapsedCluster === cluster.id)
  const toggleCluster = useNav((s) => s.toggleCluster)
  const [settings, setSettings] = useState(false)

  const active = cluster.id === activeId
  const open = active && !collapsed
  const phase = PHASE[cluster.phase]

  const live = cluster.phase === 'connected' || cluster.phase === 'connecting'
  const link = live
    ? {
        icon: Unplug,
        label: cluster.phase === 'connecting' ? 'Cancel connecting' : 'Disconnect',
        run: () => void disconnect(cluster.id),
      }
    : {
        icon: Plug,
        label: cluster.phase === 'error' ? 'Retry connection' : 'Connect',
        run: () => void connect(cluster.id),
      }

  return (
    <div>
      <div className="group relative">
        <button
          onClick={() => (active ? toggleCluster(cluster.id) : void activate(cluster.id))}
          className={cn(
            'flex w-full items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-left transition-colors',
            active ? 'bg-accent-dim' : 'hover:bg-raised',
          )}
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 transition-transform',
              open && 'rotate-90',
              active ? 'text-accent' : 'text-faint',
            )}
          />

          <span
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-md text-[10px] font-semibold',
              active ? 'bg-accent text-base' : 'bg-raised text-muted group-hover:bg-overlay',
            )}
          >
            {initials(cluster.name)}
          </span>

          <span
            title={cluster.name}
            className={cn(
              'flex-1 truncate text-[13.5px]',
              active ? 'font-semibold text-accent' : 'font-medium text-text',
            )}
          >
            {cluster.name}
          </span>

          {cluster.phase === 'connected' && cluster.version && (
            <span className="shrink-0 text-[10.5px] text-faint">{cluster.version}</span>
          )}

          <Tooltip label={phase.label} side="top">
            <span aria-label={phase.label} className="grid size-3 shrink-0 place-items-center">
              <Dot tone={phase.tone} />
            </span>
          </Tooltip>
        </button>

        <div
          className={cn(
            'absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-md px-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100',
            active ? 'bg-accent-dim' : 'bg-raised',
          )}
        >
          <RowAction icon={link.icon} label={link.label} onClick={link.run} />
          <RowAction icon={Settings2} label="Cluster settings" onClick={() => setSettings(true)} />
        </div>
      </div>

      {open && (
        <div className="ml-[15px] border-l border-line pl-1">
          {cluster.phase === 'error' && (
            <p className="py-1.5 pl-6 pr-2 text-[11.5px] text-danger">
              {cluster.error || phase.label}
            </p>
          )}
          {children}
        </div>
      )}

      {settings && (
        <ClusterSettingsDialog cluster={cluster} onClose={() => setSettings(false)} />
      )}
    </div>
  )
}
