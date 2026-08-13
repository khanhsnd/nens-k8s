import { TriangleAlert } from 'lucide-react'
import { bytes, millicores } from '@/shared/lib/format'
import { Badge, Dot, type Tone } from '@/shared/ui/Badge'
import { Tooltip } from '@/shared/ui/Tooltip'
import { AGE_COLUMN, NAME_COLUMN, NAMESPACE_COLUMN } from './common.columns'
import type { K8sObject, ResourceColumn } from './resource.types'

const PENDING = new Set(['Pending', 'Terminating', 'ContainerCreating', 'PodInitializing'])
const STARTING = new Set(['ContainerCreating', 'PodInitializing'])

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

export function podWarnings(pod: K8sObject): string[] {
  const warnings: string[] = []

  for (const container of containerStatuses(pod)) {
    const waiting = container.state?.waiting?.reason
    const terminated = container.state?.terminated

    if (waiting && !STARTING.has(waiting)) warnings.push(`${container.name}: ${waiting}`)
    else if (terminated && terminated.exitCode !== 0) {
      warnings.push(`${container.name}: ${terminated.reason ?? 'Error'} (exit ${terminated.exitCode})`)
    } else if (!container.ready && pod.status?.phase === 'Running') {
      warnings.push(`${container.name}: not ready`)
    }
  }

  if (pod.status?.phase === 'Failed') warnings.push(pod.status?.reason ?? 'Failed')
  return warnings
}

export function containerTone(container: any): Tone {
  if (container.state?.waiting) {
    return STARTING.has(container.state.waiting.reason) ? 'warn' : 'danger'
  }
  if (container.state?.terminated) return container.state.terminated.exitCode === 0 ? 'info' : 'danger'
  return container.ready ? 'ok' : 'warn'
}

function containers(pod: K8sObject): string {
  const statuses = containerStatuses(pod)
  const total = pod.spec?.containers?.length ?? statuses.length
  return `${statuses.filter((container) => container.ready).length}/${total}`
}

function restarts(pod: K8sObject): number {
  return containerStatuses(pod).reduce((total, container) => total + (container.restartCount ?? 0), 0)
}

function controlledBy(pod: K8sObject): string {
  const owners = pod.metadata.ownerReferences ?? []
  const owner = owners.find((reference) => reference.controller) ?? owners[0]
  return owner ? `${owner.kind}/${owner.name}` : '—'
}

export const POD_COLUMNS: ResourceColumn[] = [
  {
    key: 'warnings',
    label: 'Warnings',
    header: <TriangleAlert className="size-3.5" />,
    min: 44,
    grow: 0,
    text: (row) => podWarnings(row).join('; '),
    cell: (row) => {
      const warnings = podWarnings(row)
      if (warnings.length === 0) return null

      return (
        <Tooltip
          label={
            <ul className="max-w-72 space-y-0.5">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          }
        >
          <span className="flex h-full items-center text-warn">
            <TriangleAlert className="size-3.5" />
          </span>
        </Tooltip>
      )
    },
  },
  NAME_COLUMN,
  NAMESPACE_COLUMN,
  {
    key: 'cpu',
    label: 'CPU',
    min: 64,
    grow: 0.3,
    text: (row) => (row.metrics ? millicores(row.metrics.cpuMilli) : '—'),
  },
  {
    key: 'memory',
    label: 'Memory',
    min: 76,
    grow: 0.3,
    text: (row) => (row.metrics ? bytes(row.metrics.memoryBytes) : '—'),
  },
  {
    key: 'containers',
    label: 'Containers',
    min: 100,
    grow: 0.5,
    text: containers,
    cell: (row) => (
      <span className="flex h-full items-center gap-1">
        {containerStatuses(row).map((container) => (
          <Dot key={container.name} tone={containerTone(container)} />
        ))}
        <span className="ml-1 text-faint">{containers(row)}</span>
      </span>
    ),
  },
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
  { key: 'owner', label: 'Controlled By', min: 150, grow: 1, text: controlledBy },
  { key: 'node', label: 'Node', min: 150, grow: 1.3, text: (row) => row.spec?.nodeName ?? '—' },
  { key: 'qos', label: 'QoS', min: 80, grow: 0.4, text: (row) => row.status?.qosClass ?? '—' },
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
  { key: 'ip', label: 'IP', min: 110, grow: 0.6, text: (row) => row.status?.podIP ?? '—' },
  AGE_COLUMN,
]
