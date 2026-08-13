import type { Tone } from '@/shared/ui/Badge'

export const LAYERS = ['ingress', 'service', 'workload', 'pod', 'node'] as const

export type Layer = (typeof LAYERS)[number]

export const LAYER_LABELS: Record<Layer, string> = {
  ingress: 'Ingress',
  service: 'Services',
  workload: 'Workloads',
  pod: 'Pods',
  node: 'Nodes',
}

export type GraphNode = {
  /** Unique in the graph; `kindId` and `uid` are what the drawer needs. */
  id: string
  layer: Layer
  kindId: string
  uid: string
  kind: string
  name: string
  /** Empty for a cluster-scoped object, which lands in the cluster lane. */
  namespace: string
  tone: Tone
  status: string
  /** Short facts under the name, joined by a separator. */
  stats: string[]
  pods: number
  expandable: boolean
}

export type EdgeKind = 'route' | 'select' | 'owns' | 'runs'

export type GraphEdge = {
  id: string
  from: string
  to: string
  kind: EdgeKind
  label?: string
}

export type Graph = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** What the scope would have drawn, when that was more than a picture holds. */
  oversized: number
}

export type Placed = GraphNode & { x: number; y: number }

export type Lane = { id: string; label: string; y: number; height: number }

export type Column = { layer: Layer; label: string; x: number }

export type Layout = {
  nodes: Placed[]
  edges: GraphEdge[]
  lanes: Lane[]
  columns: Column[]
  width: number
  height: number
}

export const NODE_WIDTH = 224
export const NODE_HEIGHT = 66
