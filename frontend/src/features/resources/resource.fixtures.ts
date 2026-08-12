import { FIXTURE_RESOURCES } from '@/features/discovery/discovery.fixtures'
import type { EventRecord, K8sObject, OwnerRef } from './resource.types'

const NAMESPACES = ['default', 'kube-system', 'monitoring', 'ingress-nginx', 'argocd']
const APPS = ['api-gateway', 'auth-svc', 'billing', 'worker', 'redis', 'postgres', 'nginx', 'otel-collector']
const PHASES = ['Running', 'Running', 'Running', 'Running', 'Pending', 'CrashLoopBackOff'] as const

function hash(seed: number) {
  const value = Math.sin(seed) * 10000
  return value - Math.floor(value)
}

function meta(name: string, seed: number, namespace?: string): K8sObject['metadata'] {
  return {
    uid: namespace ? `${namespace}/${name}` : name,
    name,
    namespace,
    creationTimestamp: new Date(
      Date.now() - Math.floor(hash(seed * 17) * 1000 * 3600 * 24 * 30),
    ).toISOString(),
    labels: { 'app.kubernetes.io/name': name.split('-').slice(0, 2).join('-') },
  }
}

function containerState(phase: string) {
  if (phase === 'Pending') return { waiting: { reason: 'ContainerCreating' } }
  if (phase === 'CrashLoopBackOff') {
    return { waiting: { reason: 'CrashLoopBackOff', message: 'back-off 5m0s restarting failed container' } }
  }
  return { running: { startedAt: new Date().toISOString() } }
}

function makePods(count = 800): K8sObject[] {
  return Array.from({ length: count }, (_, index) => {
    const app = APPS[index % APPS.length]
    const namespace = NAMESPACES[index % NAMESPACES.length]
    const phase = PHASES[Math.floor(hash(index) * PHASES.length)]
    const name = `${app}-${(7000 + index).toString(36)}-${Math.floor(hash(index * 3) * 99999).toString(36)}`

    return {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        ...meta(name, index, namespace),
        ownerReferences: [
          { kind: 'ReplicaSet', name: `${app}-${(7000 + index).toString(36)}`, controller: true },
        ],
      },
      spec: {
        nodeName: `node-${(index % 6) + 1}.sgn.internal`,
        initContainers: index % 4 === 0 ? [{ name: 'wait-for-config' }] : undefined,
        containers: [{ name: app, image: `registry.internal/${app}:1.${index % 9}.0` }],
      },
      status: {
        phase: phase === 'CrashLoopBackOff' ? 'Running' : phase,
        qosClass: index % 3 === 0 ? 'Guaranteed' : index % 3 === 1 ? 'Burstable' : 'BestEffort',
        podIP: `10.244.${index % 6}.${(index % 250) + 2}`,
        containerStatuses: [
          {
            name: app,
            ready: phase === 'Running',
            restartCount: phase === 'CrashLoopBackOff' ? Math.floor(hash(index * 7) * 40) : 0,
            state: containerState(phase),
          },
        ],
      },
    }
  })
}

function makeDeployments(): K8sObject[] {
  return APPS.flatMap((app, index) =>
    NAMESPACES.slice(0, 3).map((namespace, offset) => {
      const seed = index * 5 + offset
      const replicas = (seed % 4) + 1
      const ready = seed % 7 === 0 ? replicas - 1 : replicas

      return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: meta(app, seed, namespace),
        spec: {
          replicas,
          template: {
            spec: { containers: [{ name: app, image: `registry.internal/${app}:1.${seed % 9}.0` }] },
          },
        },
        status: { readyReplicas: ready, updatedReplicas: replicas, availableReplicas: ready },
      }
    }),
  )
}

function makeNodes(): K8sObject[] {
  return Array.from({ length: 6 }, (_, index): K8sObject => ({
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      ...meta(`node-${index + 1}.sgn.internal`, index),
      labels: index < 2 ? { 'node-role.kubernetes.io/control-plane': '' } : {},
    },
    spec: { unschedulable: index === 5 },
    status: {
      conditions: [{ type: 'Ready', status: index === 4 ? 'False' : 'True' }],
      addresses: [{ type: 'InternalIP', address: `10.20.0.${index + 10}` }],
      nodeInfo: { kubeletVersion: 'v1.31.4', osImage: 'Ubuntu 22.04.5 LTS' },
    },
  }))
}

function makeServices(): K8sObject[] {
  return APPS.map((app, index) => ({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: meta(app, index, NAMESPACES[index % NAMESPACES.length]),
    spec: {
      type: index === 0 ? 'LoadBalancer' : index % 3 === 0 ? 'NodePort' : 'ClusterIP',
      clusterIP: `10.96.${index}.${index + 5}`,
      ports: [{ port: 80, protocol: 'TCP', nodePort: index % 3 === 0 ? 30000 + index : undefined }],
    },
    status: index === 0 ? { loadBalancer: { ingress: [{ ip: '10.20.0.200' }] } } : {},
  }))
}

function makeConfigMaps(): K8sObject[] {
  return APPS.map((app, index) => ({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: meta(`${app}-config`, index, NAMESPACES[index % NAMESPACES.length]),
    data: { 'app.yaml': 'log_level: info\n', 'features.json': '{"beta":false}' },
  }))
}

/** The CRDs behind the custom kinds of `discovery.fixtures`, so both tables agree. */
function makeDefinitions(): K8sObject[] {
  return FIXTURE_RESOURCES.filter((resource) => resource.custom).map((resource, index) => ({
    apiVersion: 'apiextensions.k8s.io/v1',
    kind: 'CustomResourceDefinition',
    metadata: meta(`${resource.gvr.resource}.${resource.gvr.group}`, index),
    spec: {
      group: resource.gvr.group,
      scope: resource.namespaced ? 'Namespaced' : 'Cluster',
      names: { kind: resource.kind, plural: resource.gvr.resource },
      versions: [{ name: resource.gvr.version, served: true, storage: true }],
    },
  }))
}

const SYNC = ['Synced', 'Synced', 'OutOfSync'] as const
const HEALTH = ['Healthy', 'Healthy', 'Degraded', 'Progressing'] as const

/** A custom kind with real printer-column values behind it. */
function makeApplications(): K8sObject[] {
  return APPS.map((app, index) => ({
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'Application',
    metadata: meta(app, index, 'argocd'),
    spec: { project: 'default', destination: { namespace: NAMESPACES[index % NAMESPACES.length] } },
    status: {
      sync: {
        status: SYNC[Math.floor(hash(index * 11) * SYNC.length)],
        revision: Math.floor(hash(index * 13) * 1e12).toString(16),
      },
      health: { status: HEALTH[Math.floor(hash(index * 19) * HEALTH.length)] },
    },
  }))
}

const BUILDERS: Record<string, () => K8sObject[]> = {
  pods: makePods,
  deployments: makeDeployments,
  nodes: makeNodes,
  services: makeServices,
  configmaps: makeConfigMaps,
  definitions: makeDefinitions,
  'crd:argoproj.io/applications': makeApplications,
}

const cache = new Map<string, K8sObject[]>()

export function fixtureObjects(kindId: string): K8sObject[] {
  if (!cache.has(kindId)) cache.set(kindId, BUILDERS[kindId]?.() ?? [])
  return cache.get(kindId) ?? []
}

const apps = (resource: string) => ({ group: 'apps', version: 'v1', resource })

export function fixtureOwners(object: K8sObject): OwnerRef[] {
  const owner = object.metadata.ownerReferences?.[0]
  if (!owner) return []

  const namespace = object.metadata.namespace ?? ''
  const chain: OwnerRef[] = [
    {
      gvr: apps('replicasets'),
      kind: owner.kind,
      name: owner.name,
      namespace,
      uid: `${namespace}/${owner.name}`,
    },
  ]

  if (owner.kind === 'ReplicaSet') {
    const name = owner.name.split('-').slice(0, -1).join('-')
    chain.push({
      gvr: apps('deployments'),
      kind: 'Deployment',
      name,
      namespace,
      uid: `${namespace}/${name}`,
    })
  }
  return chain
}

export function fixtureEvents(object: K8sObject): EventRecord[] {
  const minutes = (count: number) => new Date(Date.now() - count * 60_000).toISOString()
  const events: EventRecord[] = [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: `Successfully assigned ${object.metadata.name} to ${object.spec?.nodeName ?? 'a node'}`,
      source: 'default-scheduler',
      count: 1,
      last: minutes(24),
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image already present on machine',
      source: 'kubelet',
      count: 1,
      last: minutes(23),
    },
  ]

  if (object.status?.phase && object.status.phase !== 'Running') {
    events.unshift({
      type: 'Warning',
      reason: 'BackOff',
      message: `Back-off restarting failed container in pod ${object.metadata.name}`,
      source: 'kubelet',
      count: 12,
      last: minutes(2),
    })
  }
  return events
}
