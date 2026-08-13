import { usageKey } from '@/features/metrics/metrics.store'
import type { Usage } from '@/features/metrics/metrics.types'
import {
  allocatableCPU,
  allocatableMemory,
  allocatablePods,
  nodeStatus,
} from '@/features/resources/node.columns'
import { podStatus, podStatusTone } from '@/features/resources/pod.columns'
import type { K8sObject } from '@/features/resources/resource.types'
import type { Tone } from '@/shared/ui/Badge'

/** The kinds the overview reads — `AppShell` subscribes them for an open overview tab. */
export const OVERVIEW_KINDS = ['nodes', 'pods', 'events']

const WARNING_LIMIT = 25

export type Gauge = { used: number; total: number }

export type Phase = { label: string; count: number; tone: Tone }

export type Warning = {
  uid: string
  reason: string
  message: string
  object: string
  count: number
  last: string
}

export type Overview = {
  nodes: { ready: number; total: number }
  cpu: Gauge
  memory: Gauge
  pods: Gauge
  phases: Phase[]
  warnings: Warning[]
}

/**
 * Capacity comes from the node objects and usage from metrics.k8s.io: the two
 * meet here rather than in the backend, so a cluster with no metrics-server
 * still gets its node, pod and event counts.
 */
export function summarise(
  nodes: K8sObject[],
  pods: K8sObject[],
  events: K8sObject[],
  usage: Map<string, Usage>,
): Overview {
  const cpu: Gauge = { used: 0, total: 0 }
  const memory: Gauge = { used: 0, total: 0 }
  let ready = 0

  for (const node of nodes) {
    if (nodeStatus(node).startsWith('Ready')) ready += 1

    cpu.total += allocatableCPU(node)
    memory.total += allocatableMemory(node)

    const sample = usage.get(usageKey(undefined, node.metadata.name))
    cpu.used += sample?.cpuMilli ?? 0
    memory.used += sample?.memoryBytes ?? 0
  }

  return {
    nodes: { ready, total: nodes.length },
    cpu,
    memory,
    pods: { used: pods.length, total: nodes.reduce((total, node) => total + allocatablePods(node), 0) },
    phases: phases(pods),
    warnings: warnings(events),
  }
}

function phases(pods: K8sObject[]): Phase[] {
  const counts = new Map<string, number>()
  for (const pod of pods) {
    const status = podStatus(pod)
    counts.set(status, (counts.get(status) ?? 0) + 1)
  }

  return [...counts]
    .map(([label, count]) => ({ label, count, tone: podStatusTone(label) }))
    .sort((a, b) => b.count - a.count)
}

/** A core/v1 Event keeps its fields at the top level, not under spec or status. */
type EventObject = K8sObject & {
  type?: string
  reason?: string
  message?: string
  count?: number
  lastTimestamp?: string
  eventTime?: string
  involvedObject?: { kind?: string; name?: string }
}

const seenAt = (event: EventObject): string =>
  event.lastTimestamp ?? event.eventTime ?? event.metadata.creationTimestamp ?? ''

function warnings(events: K8sObject[]): Warning[] {
  return (events as EventObject[])
    .filter((event) => event.type === 'Warning')
    .map((event) => ({
      uid: event.metadata.uid,
      reason: event.reason ?? 'Warning',
      message: event.message ?? '',
      object: [event.involvedObject?.kind, event.involvedObject?.name].filter(Boolean).join('/'),
      count: event.count ?? 1,
      last: seenAt(event),
    }))
    // ISO timestamps sort chronologically as text, and every one of these is UTC.
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, WARNING_LIMIT)
}
