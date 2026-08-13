import { useEffect, useState } from 'react'
import { useClusters, activeCluster } from '@/features/clusters/cluster.store'
import { appVersion } from '@/features/settings/settings.api'
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
  const [version, setVersion] = useState('')

  useEffect(() => {
    void appVersion().then(setVersion)
  }, [])

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-line bg-surface px-3 text-xs text-faint">
      <span className="flex items-center gap-1.5">
        <Dot tone={cluster ? PHASE_TONE[cluster.phase] : 'neutral'} />
        {cluster?.name ?? 'no cluster'}
      </span>
      {cluster?.version && <span>{cluster.version}</span>}
      <span className="truncate">{cluster?.server}</span>
      {offline && <span className="text-warn">fixture data</span>}
      <span className="ml-auto">{version && `Nens ${version}`}</span>
    </footer>
  )
}
