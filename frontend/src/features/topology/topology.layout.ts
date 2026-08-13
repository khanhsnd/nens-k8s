import {
  LAYERS,
  LAYER_LABELS,
  NODE_HEIGHT,
  NODE_WIDTH,
  type Graph,
  type GraphNode,
  type Lane,
  type Layout,
  type Placed,
} from './topology.types'

const MARGIN = 28
const COLUMN_GAP = 104
const ROW_GAP = 16
const LANE_PAD = 16
const LANE_GAP = 12
const LANE_LABEL = 22
const SWEEPS = 4

/** A cluster-scoped object belongs to no namespace, so it gets its own lane. */
const CLUSTER_LANE = ''

const laneOf = (node: GraphNode) => node.namespace

const stackHeight = (count: number) => (count === 0 ? 0 : count * NODE_HEIGHT + (count - 1) * ROW_GAP)

function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, value) => total + value, 0) / values.length
}

/**
 * Layers are columns and namespaces are lanes, because both questions people ask
 * of a cluster picture — "what is in front of what" and "what belongs to whom" —
 * then have an axis each. Within a lane the order is the barycentre of each
 * node's neighbours, swept both ways a few times, which is the cheap half of
 * Sugiyama and enough to keep the curves from crossing.
 */
export function layout(graph: Graph): Layout {
  const present = LAYERS.filter((layer) => graph.nodes.some((node) => node.layer === layer))
  const columns = present.map((layer, index) => ({
    layer,
    label: LAYER_LABELS[layer],
    x: MARGIN + index * (NODE_WIDTH + COLUMN_GAP),
  }))

  const lanes = [...new Set(graph.nodes.map(laneOf))].sort((a, b) => {
    if (a === CLUSTER_LANE) return 1
    if (b === CLUSTER_LANE) return -1
    return a.localeCompare(b)
  })

  const cells = group(graph.nodes, (node) => `${laneOf(node)}|${node.layer}`)
  for (const cell of cells.values()) cell.sort((a, b) => a.name.localeCompare(b.name))

  const slot = new Map<string, number>()
  const reslot = () => {
    for (const cell of cells.values()) cell.forEach((node, index) => slot.set(node.id, index))
  }
  reslot()

  const before = new Map<string, string[]>()
  const after = new Map<string, string[]>()
  for (const edge of graph.edges) {
    after.set(edge.from, [...(after.get(edge.from) ?? []), edge.to])
    before.set(edge.to, [...(before.get(edge.to) ?? []), edge.from])
  }

  for (let pass = 0; pass < SWEEPS; pass += 1) {
    const side = pass % 2 === 0 ? before : after

    for (const cell of cells.values()) {
      const weight = new Map(
        cell.map((node) => [
          node.id,
          mean((side.get(node.id) ?? []).map((id) => slot.get(id) ?? 0)) ?? slot.get(node.id) ?? 0,
        ]),
      )
      cell.sort((a, b) => weight.get(a.id)! - weight.get(b.id)! || a.name.localeCompare(b.name))
    }
    reslot()
  }

  const placed: Placed[] = []
  const bands: Lane[] = []
  let y = MARGIN

  for (const lane of lanes) {
    const stacks = present.map((layer) => cells.get(`${lane}|${layer}`) ?? [])
    const inner = Math.max(...stacks.map((stack) => stackHeight(stack.length)))
    const height = LANE_LABEL + LANE_PAD * 2 + inner

    bands.push({ id: lane, label: lane || 'cluster scope', y, height })

    stacks.forEach((stack, index) => {
      const top = y + LANE_LABEL + LANE_PAD + (inner - stackHeight(stack.length)) / 2
      stack.forEach((node, row) => {
        placed.push({ ...node, x: columns[index].x, y: top + row * (NODE_HEIGHT + ROW_GAP) })
      })
    })

    y += height + LANE_GAP
  }

  return {
    nodes: placed,
    edges: graph.edges,
    lanes: bands,
    columns,
    width: MARGIN * 2 + columns.length * NODE_WIDTH + Math.max(0, columns.length - 1) * COLUMN_GAP,
    height: y - LANE_GAP + MARGIN,
  }
}
