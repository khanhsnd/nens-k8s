import { usageKey } from '@/features/metrics/metrics.store'
import type { Usage } from '@/features/metrics/metrics.types'
import { allocatableCPU, allocatableMemory, nodeStatus } from '@/features/resources/node.columns'
import { podStatus, podStatusTone } from '@/features/resources/pod.columns'
import type { K8sObject } from '@/features/resources/resource.types'
import { bytes, millicores, percent } from '@/shared/lib/format'
import type { Tone } from '@/shared/ui/Badge'
import type { Graph, GraphEdge, GraphNode, Layer } from './topology.types'

const WORKLOAD_KIND: Record<string, string> = {
  deployments: 'Deployment',
  statefulsets: 'StatefulSet',
  daemonsets: 'DaemonSet',
  jobs: 'Job',
}

/** The kinds the graph reads — `AppShell` subscribes them for an open topology tab. */
export const TOPOLOGY_KINDS = [
  'ingresses',
  'services',
  ...Object.keys(WORKLOAD_KIND),
  'replicasets',
  'pods',
  'nodes',
]

/** Past this a graph stops being a picture, so the view asks for a narrower scope. */
export const MAX_NODES = 320

export type Sources = Record<string, Map<string, K8sObject> | undefined>

export type Options = {
  namespaces: string[]
  layers: Record<Layer, boolean>
  expanded: Record<string, boolean>
  usage: Map<string, Usage>
}

const values = (objects?: Map<string, K8sObject>): K8sObject[] => [...(objects?.values() ?? [])]

const nameKey = (namespace: string | undefined, name: string) => `${namespace ?? ''}/${name}`

const refKey = (kind: string, namespace: string | undefined, name: string) =>
  `${kind}:${nameKey(namespace, name)}`

export const nodeId = (kindId: string, uid: string) => `${kindId}/${uid}`

/** What `Options.expanded` is keyed by, from either side of the graph. */
export const workloadKey = (node: { kind: string; namespace: string; name: string }) =>
  refKey(node.kind, node.namespace, node.name)

function controllerOf(object: K8sObject) {
  const owners = object.metadata.ownerReferences ?? []
  return owners.find((owner) => owner.controller) ?? owners[0]
}

function selects(
  selector: Record<string, string> | undefined,
  labels: Record<string, string> | undefined,
): boolean {
  const wanted = Object.entries(selector ?? {})
  if (wanted.length === 0) return false
  return wanted.every(([key, value]) => labels?.[key] === value)
}

/** `registry.internal/team/api:1.4.0` reads as `api:1.4.0` on a card this wide. */
function image(object: K8sObject): string | null {
  const container = object.spec?.template?.spec?.containers?.[0] ?? object.spec?.containers?.[0]
  const reference: string | undefined = container?.image
  return reference ? reference.split('/').pop()! : null
}

function replicasOf(kind: string, object: K8sObject): { ready: number; desired: number } {
  if (kind === 'DaemonSet') {
    return {
      ready: object.status?.numberReady ?? 0,
      desired: object.status?.desiredNumberScheduled ?? 0,
    }
  }
  if (kind === 'Job') {
    return { ready: object.status?.succeeded ?? 0, desired: object.spec?.completions ?? 1 }
  }
  return { ready: object.status?.readyReplicas ?? 0, desired: object.spec?.replicas ?? 1 }
}

function replicaTone(ready: number, desired: number): Tone {
  if (desired === 0) return 'neutral'
  if (ready >= desired) return 'ok'
  return ready === 0 ? 'danger' : 'warn'
}

function usageStats(usage: Map<string, Usage>, object: K8sObject, total?: K8sObject): string[] {
  const sample = usage.get(usageKey(object.metadata.namespace, object.metadata.name))
  if (!sample) return []
  if (!total) return [millicores(sample.cpuMilli), bytes(sample.memoryBytes)]

  return [
    `cpu ${percent(sample.cpuMilli, allocatableCPU(total))}`,
    `mem ${percent(sample.memoryBytes, allocatableMemory(total))}`,
  ]
}

function serviceStats(service: K8sObject): string[] {
  const ports: any[] = service.spec?.ports ?? []
  return [
    service.spec?.type ?? 'ClusterIP',
    ...ports.slice(0, 2).map((port) => `${port.port}/${port.protocol ?? 'TCP'}`),
  ]
}

function ingressHosts(ingress: K8sObject): string[] {
  return (ingress.spec?.rules ?? [])
    .map((rule: any) => rule.host)
    .filter((host: string | undefined): host is string => Boolean(host))
}

function ingressBackends(ingress: K8sObject): string[] {
  const paths: any[] = (ingress.spec?.rules ?? []).flatMap(
    (rule: any) => rule.http?.paths ?? [],
  )
  const names = [
    ingress.spec?.defaultBackend?.service?.name,
    ...paths.map((path) => path.backend?.service?.name),
  ]
  return [...new Set(names.filter((name): name is string => Boolean(name)))]
}

type Workload = { object: K8sObject; kindId: string; kind: string }

/**
 * The whole graph, from the informer caches alone: nothing here reads the API.
 * A pod reaches its workload through the ReplicaSet it is owned by, which is why
 * `replicasets` is subscribed even though it is never drawn.
 */
export function build(sources: Sources, options: Options): Graph {
  const scope = new Set(options.namespaces)
  const inScope = (object: K8sObject) =>
    scope.size === 0 || scope.has(object.metadata.namespace ?? '')

  const workloads = new Map<string, Workload>()
  for (const [kindId, kind] of Object.entries(WORKLOAD_KIND)) {
    for (const object of values(sources[kindId])) {
      if (inScope(object)) {
        workloads.set(refKey(kind, object.metadata.namespace, object.metadata.name), {
          object,
          kindId,
          kind,
        })
      }
    }
  }

  const replicaSets = new Map(
    values(sources.replicasets).map(
      (set) => [nameKey(set.metadata.namespace, set.metadata.name), set] as const,
    ),
  )

  const owningWorkload = (pod: K8sObject): string | null => {
    const owner = controllerOf(pod)
    if (!owner) return null

    const namespace = pod.metadata.namespace
    if (owner.kind !== 'ReplicaSet') return refKey(owner.kind, namespace, owner.name)

    const set = replicaSets.get(nameKey(namespace, owner.name))
    const parent = set && controllerOf(set)
    return parent ? refKey(parent.kind, namespace, parent.name) : null
  }

  const podsOf = new Map<string, K8sObject[]>()
  const loose: K8sObject[] = []

  for (const pod of values(sources.pods)) {
    if (!inScope(pod)) continue

    const key = owningWorkload(pod)
    if (key && workloads.has(key)) podsOf.set(key, [...(podsOf.get(key) ?? []), pod])
    else loose.push(pod)
  }

  const machines = options.layers.node ? values(sources.nodes) : []
  const services = options.layers.service ? values(sources.services).filter(inScope) : []
  const ingresses = options.layers.ingress ? values(sources.ingresses).filter(inScope) : []

  const shown = [...workloads.keys()].filter((key) => options.expanded[key])
  const expandedPods = shown.reduce((total, key) => total + (podsOf.get(key)?.length ?? 0), 0)
  const size =
    workloads.size + loose.length + expandedPods + machines.length + services.length + ingresses.length

  if (size > MAX_NODES) return { nodes: [], edges: [], oversized: size }

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const drawn = new Set<string>()

  const push = (node: GraphNode) => {
    nodes.push(node)
    drawn.add(node.id)
  }
  const add = (edge: GraphEdge) => {
    if (drawn.has(edge.from) && drawn.has(edge.to)) edges.push(edge)
  }

  // Every pod counts towards its node, in scope or not: a node's load is not a
  // property of the namespace being looked at.
  const load = new Map<string, number>()
  for (const pod of values(sources.pods)) {
    const on = pod.spec?.nodeName
    if (on) load.set(on, (load.get(on) ?? 0) + 1)
  }

  const machineId = new Map(
    machines.map((machine) => [machine.metadata.name, nodeId('nodes', machine.metadata.uid)] as const),
  )

  for (const machine of machines) {
    const status = nodeStatus(machine)
    const running = load.get(machine.metadata.name) ?? 0

    push({
      id: nodeId('nodes', machine.metadata.uid),
      layer: 'node',
      kindId: 'nodes',
      uid: machine.metadata.uid,
      kind: 'Node',
      name: machine.metadata.name,
      namespace: '',
      tone: status.startsWith('Ready') ? (machine.spec?.unschedulable ? 'warn' : 'ok') : 'danger',
      status,
      stats: [`${running} pods`, ...usageStats(options.usage, machine, machine)],
      pods: running,
      expandable: false,
    })
  }

  const podNode = (pod: K8sObject): GraphNode => {
    const status = podStatus(pod)
    return {
      id: nodeId('pods', pod.metadata.uid),
      layer: 'pod',
      kindId: 'pods',
      uid: pod.metadata.uid,
      kind: 'Pod',
      name: pod.metadata.name,
      namespace: pod.metadata.namespace ?? '',
      tone: podStatusTone(status),
      status,
      stats: [pod.spec?.nodeName ?? 'unscheduled', ...usageStats(options.usage, pod)],
      pods: 0,
      expandable: false,
    }
  }

  const placement = (pod: K8sObject, from: string) => {
    const target = machineId.get(pod.spec?.nodeName ?? '')
    if (target) add({ id: `runs:${from}->${target}`, from, to: target, kind: 'runs' })
  }

  for (const [key, { object, kindId, kind }] of workloads) {
    const id = nodeId(kindId, object.metadata.uid)
    const { ready, desired } = replicasOf(kind, object)
    const pods = podsOf.get(key) ?? []
    const short = image(object)

    push({
      id,
      layer: 'workload',
      kindId,
      uid: object.metadata.uid,
      kind,
      name: object.metadata.name,
      namespace: object.metadata.namespace ?? '',
      tone: replicaTone(ready, desired),
      status: `${ready}/${desired} ready`,
      stats: short ? [short] : [],
      pods: pods.length,
      expandable: pods.length > 0,
    })

    if (!options.expanded[key]) {
      const spread = new Map<string, number>()
      for (const pod of pods) {
        const target = machineId.get(pod.spec?.nodeName ?? '')
        if (target) spread.set(target, (spread.get(target) ?? 0) + 1)
      }
      for (const [target, count] of spread) {
        add({ id: `runs:${id}->${target}`, from: id, to: target, kind: 'runs', label: String(count) })
      }
      continue
    }

    for (const pod of pods) {
      const child = podNode(pod)
      push(child)
      add({ id: `owns:${id}->${child.id}`, from: id, to: child.id, kind: 'owns' })
      placement(pod, child.id)
    }
  }

  for (const pod of loose) {
    const child = podNode(pod)
    push(child)
    placement(pod, child.id)
  }

  const serviceId = new Map<string, string>()

  // A Service selects pods, but one edge per pod is a hairball and O(pods ×
  // services). The workload's pod template carries the same labels, so the edge
  // lands on the workload, and only a pod nobody controls gets its own.
  for (const service of services) {
    const id = nodeId('services', service.metadata.uid)
    const namespace = service.metadata.namespace ?? ''
    serviceId.set(nameKey(namespace, service.metadata.name), id)

    const backing: string[] = []
    for (const { object, kindId } of workloads.values()) {
      if (
        object.metadata.namespace === namespace &&
        selects(service.spec?.selector, object.spec?.template?.metadata?.labels)
      ) {
        backing.push(nodeId(kindId, object.metadata.uid))
      }
    }
    for (const pod of loose) {
      if (
        pod.metadata.namespace === namespace &&
        selects(service.spec?.selector, pod.metadata.labels)
      ) {
        backing.push(nodeId('pods', pod.metadata.uid))
      }
    }

    push({
      id,
      layer: 'service',
      kindId: 'services',
      uid: service.metadata.uid,
      kind: 'Service',
      name: service.metadata.name,
      namespace,
      tone: backing.length > 0 ? 'info' : 'warn',
      status: backing.length > 0 ? `${backing.length} backends` : 'selects nothing',
      stats: serviceStats(service),
      pods: 0,
      expandable: false,
    })

    for (const to of backing) add({ id: `select:${id}->${to}`, from: id, to, kind: 'select' })
  }

  for (const ingress of ingresses) {
    const id = nodeId('ingresses', ingress.metadata.uid)
    const namespace = ingress.metadata.namespace ?? ''
    const backends = ingressBackends(ingress)
    const routed = backends.map((name) => serviceId.get(nameKey(namespace, name)))
    const missing = routed.filter((target) => target === undefined).length

    push({
      id,
      layer: 'ingress',
      kindId: 'ingresses',
      uid: ingress.metadata.uid,
      kind: 'Ingress',
      name: ingress.metadata.name,
      namespace,
      tone: missing > 0 ? 'warn' : 'neutral',
      status: missing > 0 ? `${missing} backend missing` : `${backends.length} backends`,
      stats: ingressHosts(ingress).slice(0, 2),
      pods: 0,
      expandable: false,
    })

    for (const to of routed) {
      if (to) add({ id: `route:${id}->${to}`, from: id, to, kind: 'route' })
    }
  }

  return { nodes, edges, oversized: 0 }
}
