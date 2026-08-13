import { create } from 'zustand'
import { sampleMetrics } from './metrics.api'
import type { MetricsSample, Usage } from './metrics.types'

const INTERVAL = 30_000

export const EMPTY_USAGE: Map<string, Usage> = new Map()

/**
 * Nodes and pods share one index: a node's key has no namespace and a pod's
 * always does, so they cannot collide and no caller has to pick a map.
 */
export const usageKey = (namespace: string | undefined, name: string) => `${namespace ?? ''}/${name}`

type MetricsState = {
  clusterId: string | null
  available: boolean
  error: string | null
  usage: Map<string, Usage>
  /**
   * Samples one cluster every 30s; null stops. metrics.k8s.io has no watch, so
   * the cadence lives here rather than in the backend — whoever is looking is
   * the only one who knows whether anyone is.
   */
  follow: (clusterId: string | null) => void
}

const IDLE = { clusterId: null, available: false, error: null, usage: EMPTY_USAGE }

let timer = 0

function index({ nodes, pods }: MetricsSample): Map<string, Usage> {
  const usage = new Map<string, Usage>()
  for (const item of [...(nodes ?? []), ...(pods ?? [])]) {
    usage.set(usageKey(item.namespace, item.name), item)
  }
  return usage
}

async function poll(clusterId: string) {
  try {
    const sample = await sampleMetrics(clusterId)
    // The cluster can change while a poll is in flight; a late answer belongs to
    // whoever asked for it, not to whoever is being watched now.
    if (useMetrics.getState().clusterId !== clusterId) return

    useMetrics.setState({
      available: sample.available,
      error: sample.error ?? null,
      usage: sample.available ? index(sample) : EMPTY_USAGE,
    })
  } catch (error) {
    if (useMetrics.getState().clusterId !== clusterId) return
    useMetrics.setState({ available: false, error: String(error), usage: EMPTY_USAGE })
  }
}

export const useMetrics = create<MetricsState>((set, get) => ({
  ...IDLE,

  follow: (clusterId) => {
    if (clusterId === get().clusterId) return

    clearInterval(timer)
    timer = 0
    if (!clusterId) return set(IDLE)

    set({ ...IDLE, clusterId })
    void poll(clusterId)
    timer = window.setInterval(() => void poll(clusterId), INTERVAL)
  },
}))
