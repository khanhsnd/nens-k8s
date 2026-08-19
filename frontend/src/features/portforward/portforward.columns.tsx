import { cn } from '@/shared/lib/cn'
import { Dot, Pill, type Tone } from '@/shared/ui/Badge'
import type { Column } from '@/shared/ui/DataGrid'
import {
  forwardAddress,
  forwardTarget,
  type ForwardStatus,
  type PortForward,
} from './portforward.types'

export const FORWARD_TONES: Record<ForwardStatus, Tone> = {
  starting: 'info',
  active: 'ok',
  error: 'danger',
  stopped: 'neutral',
}

export function ForwardStatusPill({ forward }: { forward: PortForward }) {
  const tone = FORWARD_TONES[forward.status]

  return (
    <Pill tone={tone} title={forward.error}>
      <Dot tone={tone} />
      {forward.status}
    </Pill>
  )
}

export const FORWARD_COLUMNS: Column<PortForward>[] = [
  {
    key: 'address',
    label: 'Local address',
    min: 160,
    grow: 1,
    fixed: true,
    text: (row) => (row.localPort > 0 ? forwardAddress(row) : ''),
    cell: (row) =>
      row.localPort > 0 ? (
        <span
          className={cn(
            'font-mono font-medium',
            row.status === 'active' ? 'text-accent' : 'text-faint',
          )}
        >
          {forwardAddress(row)}
        </span>
      ) : (
        <span className="text-faint">—</span>
      ),
  },
  {
    key: 'status',
    label: 'Status',
    min: 110,
    grow: 0.4,
    text: (row) => row.status,
    cell: (row) => <ForwardStatusPill forward={row} />,
  },
  {
    key: 'target',
    label: 'Target',
    min: 200,
    grow: 1.2,
    text: forwardTarget,
    cell: (row) => (
      <span>
        <span className="text-faint">{row.resource}/</span>
        <span className="text-text">{row.name}</span>
        <span className="font-mono text-ok">:{row.remotePort}</span>
      </span>
    ),
  },
  { key: 'pod', label: 'Pod', min: 170, grow: 1, text: (row) => row.pod },
  { key: 'namespace', label: 'Namespace', min: 130, grow: 0.6, text: (row) => row.namespace },
  { key: 'cluster', label: 'Cluster', min: 130, grow: 0.6, text: (row) => row.clusterId },
  {
    key: 'error',
    label: 'Error',
    min: 170,
    grow: 1,
    hidden: true,
    text: (row) => row.error ?? '',
    cell: (row) => <span className="text-danger">{row.error ?? ''}</span>,
  },
]
