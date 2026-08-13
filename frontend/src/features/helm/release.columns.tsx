import { age } from '@/shared/lib/format'
import { Dot, Pill, type Tone } from '@/shared/ui/Badge'
import type { Column } from '@/shared/ui/DataGrid'
import { chartOf, type HelmRelease, type HelmStatus } from './helm.types'

const TONES: Record<HelmStatus, Tone> = {
  deployed: 'ok',
  superseded: 'neutral',
  uninstalled: 'neutral',
  uninstalling: 'warn',
  'pending-install': 'info',
  'pending-upgrade': 'info',
  'pending-rollback': 'info',
  failed: 'danger',
  unknown: 'neutral',
}

export function ReleaseStatusPill({ status }: { status: HelmStatus }) {
  const tone = TONES[status] ?? 'neutral'

  return (
    <Pill tone={tone}>
      <Dot tone={tone} />
      {status}
    </Pill>
  )
}

export const RELEASE_COLUMNS: Column<HelmRelease>[] = [
  {
    key: 'name',
    label: 'Name',
    min: 200,
    grow: 2,
    fixed: true,
    text: (row) => row.name,
    cell: (row) => <span className="font-medium text-text">{row.name}</span>,
  },
  { key: 'namespace', label: 'Namespace', min: 120, grow: 1, text: (row) => row.namespace },
  { key: 'revision', label: 'Rev', min: 56, grow: 0.25, text: (row) => String(row.revision) },
  {
    key: 'status',
    label: 'Status',
    min: 140,
    grow: 0.6,
    text: (row) => row.status,
    cell: (row) => <ReleaseStatusPill status={row.status} />,
  },
  { key: 'chart', label: 'Chart', min: 180, grow: 1.2, text: chartOf },
  {
    key: 'appVersion',
    label: 'App version',
    min: 110,
    grow: 0.5,
    text: (row) => row.appVersion || '—',
  },
  {
    key: 'updated',
    label: 'Updated',
    min: 70,
    grow: 0.3,
    text: (row) => (row.updated ? age(row.updated) : '—'),
  },
  {
    key: 'description',
    label: 'Description',
    min: 200,
    grow: 1.4,
    hidden: true,
    text: (row) => row.description ?? '',
  },
]
