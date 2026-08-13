export type Usage = {
  name: string
  namespace?: string
  cpuMilli: number
  memoryBytes: number
}

/** One poll of a single pod, kept per container — the drawer's chart reads this. */
export type PodUsage = {
  name: string
  namespace: string
  available: boolean
  error?: string
  timestamp?: string
  window?: string
  containers: Usage[] | null
}

export type MetricsSample = {
  clusterId: string
  /** False when metrics-server is absent or answered an error — see `error`. */
  available: boolean
  error?: string
  nodes: Usage[] | null
  pods: Usage[] | null
}
