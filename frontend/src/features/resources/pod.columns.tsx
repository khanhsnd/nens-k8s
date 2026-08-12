import { Badge, type Tone } from '@/shared/ui/Badge'
import { AGE_COLUMN, NAME_COLUMN, NAMESPACE_COLUMN } from './common.columns'
import type { K8sObject, ResourceColumn } from './resource.types'

const PENDING = new Set(['Pending', 'Terminating', 'ContainerCreating', 'PodInitializing'])

function containerStatuses(pod: K8sObject): any[] {
  return pod.status?.containerStatuses ?? []
}

export function podStatus(pod: K8sObject): string {
  if (pod.metadata.deletionTimestamp) return 'Terminating'

  for (const container of containerStatuses(pod)) {
    const reason = container.state?.waiting?.reason ?? container.state?.terminated?.reason
    if (reason && reason !== 'Completed') return reason
  }
  return pod.status?.reason ?? pod.status?.phase ?? 'Unknown'
}

export function podStatusTone(status: string): Tone {
  if (status === 'Running') return 'ok'
  if (status === 'Succeeded' || status === 'Completed') return 'info'
  if (PENDING.has(status) || status.startsWith('Init:')) return 'warn'
  return 'danger'
}

function ready(pod: K8sObject): string {
  const statuses = containerStatuses(pod)
  const total = pod.spec?.containers?.length ?? statuses.length
  return `${statuses.filter((container) => container.ready).length}/${total}`
}

function restarts(pod: K8sObject): number {
  return containerStatuses(pod).reduce((total, container) => total + (container.restartCount ?? 0), 0)
}

export const POD_COLUMNS: ResourceColumn[] = [
  NAME_COLUMN,
  NAMESPACE_COLUMN,
  { key: 'ready', label: 'Ready', min: 60, grow: 0.4, text: ready },
  {
    key: 'restarts',
    label: 'Restarts',
    min: 64,
    grow: 0.4,
    text: (row) => String(restarts(row)),
    cell: (row) => {
      const count = restarts(row)
      return <span className={count > 0 ? 'text-warn' : undefined}>{count}</span>
    },
  },
  {
    key: 'status',
    label: 'Status',
    min: 130,
    grow: 0.8,
    text: podStatus,
    cell: (row) => {
      const status = podStatus(row)
      return <Badge tone={podStatusTone(status)}>{status}</Badge>
    },
  },
  { key: 'node', label: 'Node', min: 150, grow: 1.3, text: (row) => row.spec?.nodeName ?? '—' },
  { key: 'ip', label: 'IP', min: 110, grow: 0.6, text: (row) => row.status?.podIP ?? '—' },
  AGE_COLUMN,
]
