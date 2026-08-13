import { bytes, millicores, percent } from '@/shared/lib/format'
import { millicoresOf, quantity } from '@/shared/lib/quantity'
import { Badge } from '@/shared/ui/Badge'
import { AGE_COLUMN, NAME_COLUMN } from './common.columns'
import type { K8sObject, ResourceColumn } from './resource.types'

const ROLE_PREFIX = 'node-role.kubernetes.io/'

/**
 * What the kubelet says is left for pods, not the machine's raw capacity — it is
 * what usage is worth comparing against, and what the scheduler works from.
 */
export const allocatableCPU = (node: K8sObject): number => millicoresOf(node.status?.allocatable?.cpu)

export const allocatableMemory = (node: K8sObject): number =>
  quantity(node.status?.allocatable?.memory)

export const allocatablePods = (node: K8sObject): number => quantity(node.status?.allocatable?.pods)

/** Usage next to its share of the node, because neither number means much alone. */
function used(usage: number | undefined, total: number, format: (value: number) => string): string {
  if (usage === undefined) return '—'
  return `${format(usage)} (${percent(usage, total)})`
}

function condition(node: K8sObject, type: string): string {
  return (node.status?.conditions ?? []).find((item: any) => item.type === type)?.status ?? 'Unknown'
}

export function nodeStatus(node: K8sObject): string {
  const ready = condition(node, 'Ready') === 'True' ? 'Ready' : 'NotReady'
  return node.spec?.unschedulable ? `${ready},SchedulingDisabled` : ready
}

function roles(node: K8sObject): string {
  const labels = Object.keys(node.metadata.labels ?? {})
    .filter((label) => label.startsWith(ROLE_PREFIX))
    .map((label) => label.slice(ROLE_PREFIX.length))
  return labels.join(', ') || '—'
}

function internalIP(node: K8sObject): string {
  return (
    (node.status?.addresses ?? []).find((address: any) => address.type === 'InternalIP')?.address ??
    '—'
  )
}

export const NODE_COLUMNS: ResourceColumn[] = [
  NAME_COLUMN,
  {
    key: 'status',
    label: 'Status',
    min: 130,
    grow: 0.7,
    text: nodeStatus,
    cell: (row) => (
      <Badge tone={nodeStatus(row).startsWith('Ready') ? 'ok' : 'danger'}>{nodeStatus(row)}</Badge>
    ),
  },
  { key: 'roles', label: 'Roles', min: 110, grow: 0.7, text: roles },
  {
    key: 'cpu',
    label: 'CPU',
    min: 110,
    grow: 0.5,
    text: (row) => used(row.metrics?.cpuMilli, allocatableCPU(row), millicores),
  },
  {
    key: 'memory',
    label: 'Memory',
    min: 120,
    grow: 0.5,
    text: (row) => used(row.metrics?.memoryBytes, allocatableMemory(row), bytes),
  },
  { key: 'ip', label: 'Internal IP', min: 110, grow: 0.6, text: internalIP },
  {
    key: 'version',
    label: 'Version',
    min: 90,
    grow: 0.5,
    text: (row) => row.status?.nodeInfo?.kubeletVersion ?? '—',
  },
  {
    key: 'os',
    label: 'OS Image',
    min: 160,
    grow: 1.2,
    text: (row) => row.status?.nodeInfo?.osImage ?? '—',
  },
  AGE_COLUMN,
]
