export type Usage = {
  name: string
  namespace?: string
  cpuMilli: number
  memoryBytes: number
}

export type MetricsSample = {
  clusterId: string
  /** False when metrics-server is absent or answered an error — see `error`. */
  available: boolean
  error?: string
  nodes: Usage[] | null
  pods: Usage[] | null
}
