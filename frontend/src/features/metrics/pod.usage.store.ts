import { create } from 'zustand'
import { samplePodUsage } from './metrics.api'
import type { Usage } from './metrics.types'

/**
 * Faster than the tables' 30s: one pod's metrics is one small Get, and a chart
 * built from a 30s cadence needs a quarter of an hour to have a shape.
 */
const INTERVAL = 10_000

/** Half an hour of samples at metrics-server's usual 15s resolution. */
const CAPACITY = 120

export type Point = { at: number; cpuMilli: number; memoryBytes: number }

export type PodRef = { clusterId: string; namespace: string; name: string }

export const podKey = (ref: PodRef) => `${ref.clusterId}/${ref.namespace}/${ref.name}`

export const EMPTY_HISTORY: Map<string, Point[]> = new Map()

type PodMetricsState = {
  key: string | null
  available: boolean
  error: string | null
  /** Container name → the samples collected since this pod was selected. */
  history: Map<string, Point[]>
  /**
   * Polls one pod until another is asked for; null only stops the timer, so
   * reopening the same pod keeps the series it had already collected.
   */
  follow: (ref: PodRef | null) => void
}

const IDLE = { available: false, error: null, history: EMPTY_HISTORY }

let timer = 0

/**
 * metrics-server resamples on its own cadence, so two polls often carry the same
 * timestamp. Appending both would draw a resolution the data does not have.
 */
function append(
  history: Map<string, Point[]>,
  containers: Usage[],
  at: number,
): Map<string, Point[]> {
  const next = new Map(history)

  for (const container of containers) {
    const series = next.get(container.name) ?? []
    if (series.at(-1)?.at === at) continue

    next.set(container.name, [
      ...series.slice(Math.max(0, series.length - CAPACITY + 1)),
      { at, cpuMilli: container.cpuMilli, memoryBytes: container.memoryBytes },
    ])
  }
  return next
}

async function poll(ref: PodRef) {
  const key = podKey(ref)
  try {
    const usage = await samplePodUsage(ref.clusterId, ref.namespace, ref.name)
    // The selection can change while a poll is in flight; a late answer belongs
    // to whoever asked for it.
    if (usePodMetrics.getState().key !== key) return

    usePodMetrics.setState((state) => ({
      available: usage.available,
      error: usage.error ?? null,
      history: usage.available
        ? append(state.history, usage.containers ?? [], sampledAt(usage.timestamp))
        : state.history,
    }))
  } catch (error) {
    if (usePodMetrics.getState().key !== key) return
    usePodMetrics.setState({ available: false, error: String(error) })
  }
}

const sampledAt = (timestamp?: string) => (timestamp ? new Date(timestamp).getTime() : Date.now())

export const usePodMetrics = create<PodMetricsState>((set, get) => ({
  key: null,
  ...IDLE,

  follow: (ref) => {
    clearInterval(timer)
    timer = 0
    if (!ref) return

    const key = podKey(ref)
    if (key !== get().key) set({ key, ...IDLE })

    void poll(ref)
    timer = window.setInterval(() => void poll(ref), INTERVAL)
  },
}))
