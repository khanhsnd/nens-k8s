import { useClusters, activeCluster } from '@/features/clusters/cluster.store'
import { Dot } from '@/shared/ui/Badge'

const PHASE_TONE = {
  connected: 'ok',
  connecting: 'warn',
  error: 'danger',
  disconnected: 'neutral',
} as const

export function StatusBar() {
  const cluster = useClusters(activeCluster)
  const offline = useClusters((s) => s.offline)

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-surface px-3 text-[11px] text-faint">
      <span className="flex items-center gap-1.5">
        <Dot tone={cluster ? PHASE_TONE[cluster.phase] : 'neutral'} />
        {cluster?.name ?? 'no cluster'}
      </span>
      {cluster?.version && <span>{cluster.version}</span>}
      <span className="truncate">{cluster?.server}</span>
      {offline && <span className="text-warn">fixture data</span>}
      <span className="ml-auto">Nens 0.1.0</span>
    </footer>
  )
}
