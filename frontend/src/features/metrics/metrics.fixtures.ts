import { fixtureObjects } from '@/features/resources/resource.fixtures'
import type { K8sObject } from '@/features/resources/resource.types'
import { millicoresOf, quantity } from '@/shared/lib/quantity'
import type { MetricsSample, Usage } from './metrics.types'

/** Stable per name, so a pod keeps its share of the cluster between polls. */
function share(name: string, salt: number): number {
  let value = salt
  for (let index = 0; index < name.length; index += 1) {
    value = (value * 31 + name.charCodeAt(index)) % 100_000
  }
  return value / 100_000
}

/** A slow drift, so the donuts move while the dev server is open. */
function drift(seed: number): number {
  return 0.9 + 0.1 * Math.sin(Date.now() / 20_000 + seed)
}

function nodeUsage(node: K8sObject, index: number): Usage {
  const load = (0.35 + share(node.metadata.name, 1) * 0.4) * drift(index)

  return {
    name: node.metadata.name,
    cpuMilli: Math.round(millicoresOf(node.status?.allocatable?.cpu) * load),
    memoryBytes: Math.round(quantity(node.status?.allocatable?.memory) * load),
  }
}

function podUsage(pod: K8sObject, index: number): Usage {
  const load = share(pod.metadata.name, 7) * drift(index)

  return {
    name: pod.metadata.name,
    namespace: pod.metadata.namespace,
    cpuMilli: Math.round(4 + load * 240),
    memoryBytes: Math.round((24 + load * 700) * 1024 * 1024),
  }
}

export function fixtureSample(clusterId: string): MetricsSample {
  return {
    clusterId,
    available: true,
    nodes: fixtureObjects('nodes').map(nodeUsage),
    pods: fixtureObjects('pods').map(podUsage),
  }
}
