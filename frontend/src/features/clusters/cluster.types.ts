export type ClusterPhase = 'disconnected' | 'connecting' | 'connected' | 'error'

export type Cluster = {
  id: string
  name: string
  context: string
  server: string
  user: string
  namespace: string
  phase: ClusterPhase
  version: string
  error: string
}
