import { FIXTURE_RESOURCES } from '@/features/discovery/discovery.fixtures'
import type { EventRecord, K8sObject, OwnerRef } from './resource.types'

const NAMESPACES = ['default', 'kube-system', 'monitoring', 'ingress-nginx', 'argocd']
const APPS = ['api-gateway', 'auth-svc', 'billing', 'worker', 'redis', 'postgres', 'nginx', 'otel-collector']
const PHASES = ['Running', 'Running', 'Running', 'Running', 'Pending', 'CrashLoopBackOff'] as const

/** Not every app is a Deployment — the topology draws all three the same way. */
const CONTROLLERS: Record<string, string> = {
  redis: 'StatefulSet',
  postgres: 'StatefulSet',
  'otel-collector': 'DaemonSet',
}

const controllerOf = (app: string) => CONTROLLERS[app] ?? 'Deployment'

const appLabels = (app: string) => ({ 'app.kubernetes.io/name': app })

function hash(seed: number) {
  const value = Math.sin(seed) * 10000
  return value - Math.floor(value)
}

/** A ReplicaSet's name is its Deployment plus a stable hash of where it runs. */
function replicaSetName(app: string, namespace: string): string {
  let value = 0
  for (const character of `${app}/${namespace}`) {
    value = (value * 31 + character.charCodeAt(0)) % 1_000_000
  }
  return `${app}-${value.toString(36).padStart(4, '0').slice(-4)}`
}

/** Every (app, namespace) pair a controller of this kind owns. */
function spread(kind: string): Array<{ app: string; namespace: string; seed: number }> {
  return APPS.filter((app) => controllerOf(app) === kind).flatMap((app, index) =>
    NAMESPACES.map((namespace, offset) => ({
      app,
      namespace,
      seed: index * NAMESPACES.length + offset,
    })),
  )
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

/** Everything the drawer's container panel reads — env, mounts, probes, resources. */
function container(app: string, index: number) {
  return {
    name: app,
    image: `registry.internal/${app}:1.${index % 9}.0`,
    imagePullPolicy: index % 3 === 0 ? 'Always' : 'IfNotPresent',
    command: ['/bin/app'],
    args: ['--config', '/etc/app/app.yaml', '--log-level=info'],
    ports: [{ name: 'http', containerPort: 8080, protocol: 'TCP' }],
    env: [
      { name: 'APP_ENV', value: 'production' },
      { name: 'LOG_LEVEL', value: 'info' },
      { name: 'POD_IP', valueFrom: { fieldRef: { fieldPath: 'status.podIP' } } },
      { name: 'DB_PASSWORD', valueFrom: { secretKeyRef: { name: `${app}-db`, key: 'password' } } },
      {
        name: 'FEATURE_FLAGS',
        valueFrom: { configMapKeyRef: { name: `${app}-config`, key: 'features.json' } },
      },
    ],
    envFrom: [{ configMapRef: { name: `${app}-config` } }],
    resources: {
      requests: { cpu: '100m', memory: '128Mi' },
      limits: { cpu: '500m', memory: '512Mi' },
    },
    volumeMounts: [
      { name: 'config', mountPath: '/etc/app', readOnly: true },
      {
        name: 'kube-api-access',
        mountPath: '/var/run/secrets/kubernetes.io/serviceaccount',
        readOnly: true,
      },
    ],
    livenessProbe: { httpGet: { path: '/healthz', port: 8080 }, periodSeconds: 10 },
    readinessProbe: { httpGet: { path: '/ready', port: 8080 }, periodSeconds: 5 },
  }
}

const INIT_CONTAINER = {
  name: 'wait-for-config',
  image: 'busybox:1.36',
  command: ['sh', '-c', 'until nc -z config 80; do sleep 1; done'],
}

const crashedState = () => ({
  terminated: {
    reason: 'Error',
    exitCode: 1,
    finishedAt: new Date(Date.now() - 120_000).toISOString(),
  },
})

const INIT_STATUS = {
  name: INIT_CONTAINER.name,
  ready: true,
  restartCount: 0,
  state: {
    terminated: {
      reason: 'Completed',
      exitCode: 0,
      startedAt: new Date(Date.now() - 3_660_000).toISOString(),
      finishedAt: new Date(Date.now() - 3_600_000).toISOString(),
    },
  },
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

    const kind = controllerOf(app)
    const owner =
      kind === 'Deployment'
        ? { kind: 'ReplicaSet', name: replicaSetName(app, namespace), controller: true }
        : { kind, name: app, controller: true }

    return {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        ...meta(name, index, namespace),
        labels: appLabels(app),
        ownerReferences: [owner],
      },
      spec: {
        nodeName: `node-${(index % 6) + 1}.sgn.internal`,
        initContainers: index % 4 === 0 ? [INIT_CONTAINER] : undefined,
        containers: [container(app, index)],
      },
      status: {
        phase: phase === 'CrashLoopBackOff' ? 'Running' : phase,
        qosClass: index % 3 === 0 ? 'Guaranteed' : index % 3 === 1 ? 'Burstable' : 'BestEffort',
        podIP: `10.244.${index % 6}.${(index % 250) + 2}`,
        initContainerStatuses: index % 4 === 0 ? [INIT_STATUS] : undefined,
        containerStatuses: [
          {
            name: app,
            ready: phase === 'Running',
            restartCount: phase === 'CrashLoopBackOff' ? Math.floor(hash(index * 7) * 40) : 0,
            state: containerState(phase),
            lastState: phase === 'CrashLoopBackOff' ? crashedState() : undefined,
          },
        ],
      },
    }
  })
}

function template(app: string, seed: number) {
  return {
    metadata: { labels: appLabels(app) },
    spec: { containers: [{ name: app, image: `registry.internal/${app}:1.${seed % 9}.0` }] },
  }
}

function makeDeployments(): K8sObject[] {
  return spread('Deployment').map(({ app, namespace, seed }) => {
    const replicas = (seed % 4) + 1
    const ready = seed % 7 === 0 ? replicas - 1 : replicas

    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: meta(app, seed, namespace),
      spec: {
        replicas,
        selector: { matchLabels: appLabels(app) },
        template: template(app, seed),
      },
      status: { readyReplicas: ready, updatedReplicas: replicas, availableReplicas: ready },
    }
  })
}

function makeReplicaSets(): K8sObject[] {
  return spread('Deployment').map(({ app, namespace, seed }) => ({
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      ...meta(replicaSetName(app, namespace), seed, namespace),
      ownerReferences: [{ kind: 'Deployment', name: app, controller: true }],
    },
    spec: { replicas: (seed % 4) + 1, selector: { matchLabels: appLabels(app) } },
    status: { readyReplicas: (seed % 4) + 1 },
  }))
}

function makeStatefulSets(): K8sObject[] {
  return spread('StatefulSet').map(({ app, namespace, seed }) => {
    const replicas = (seed % 3) + 1

    return {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: meta(app, seed, namespace),
      spec: {
        replicas,
        serviceName: app,
        selector: { matchLabels: appLabels(app) },
        template: template(app, seed),
      },
      status: { readyReplicas: seed % 5 === 0 ? replicas - 1 : replicas },
    }
  })
}

function makeDaemonSets(): K8sObject[] {
  return spread('DaemonSet').map(({ app, namespace, seed }) => ({
    apiVersion: 'apps/v1',
    kind: 'DaemonSet',
    metadata: meta(app, seed, namespace),
    spec: { selector: { matchLabels: appLabels(app) }, template: template(app, seed) },
    status: { desiredNumberScheduled: 6, numberReady: seed % 4 === 0 ? 4 : 6 },
  }))
}

const NODE_SIZES = [
  { cpu: '4', memory: '16Gi', allocatableCPU: '3860m', allocatableMemory: '15Gi', pods: '110' },
  { cpu: '8', memory: '32Gi', allocatableCPU: '7820m', allocatableMemory: '30Gi', pods: '200' },
  { cpu: '16', memory: '64Gi', allocatableCPU: '15780m', allocatableMemory: '61Gi', pods: '250' },
]

function makeNodes(): K8sObject[] {
  return Array.from({ length: 6 }, (_, index): K8sObject => {
    const size = NODE_SIZES[index % NODE_SIZES.length]

    return {
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
        capacity: { cpu: size.cpu, memory: size.memory, pods: size.pods },
        allocatable: {
          cpu: size.allocatableCPU,
          memory: size.allocatableMemory,
          pods: size.pods,
        },
      },
    }
  })
}

const WARNINGS: Array<[string, string]> = [
  ['BackOff', 'Back-off restarting failed container'],
  ['Unhealthy', 'Readiness probe failed: HTTP probe failed with statuscode: 503'],
  ['FailedScheduling', '0/6 nodes are available: 3 Insufficient cpu, 3 node(s) had untolerated taint'],
  ['FailedMount', 'Unable to attach or mount volumes: unmounted volumes=[config]'],
  ['NodeNotReady', 'Node node-5.sgn.internal status is now: NodeNotReady'],
]

/** Enough Normal events that the overview's warning filter is doing something. */
function makeEvents(): K8sObject[] {
  return fixtureObjects('pods').slice(0, 60).map((pod, index): K8sObject => {
    const warning = index % 3 === 0
    const [reason, message] = WARNINGS[index % WARNINGS.length]

    return {
      apiVersion: 'v1',
      kind: 'Event',
      metadata: meta(`${pod.metadata.name}.${index.toString(16)}`, index, pod.metadata.namespace),
      type: warning ? 'Warning' : 'Normal',
      reason: warning ? reason : 'Pulled',
      message: warning ? message : 'Container image already present on machine',
      count: warning ? Math.floor(hash(index * 23) * 30) + 1 : 1,
      lastTimestamp: new Date(Date.now() - Math.floor(hash(index * 5) * 3600_000)).toISOString(),
      involvedObject: {
        kind: 'Pod',
        name: pod.metadata.name,
        namespace: pod.metadata.namespace,
      },
    } as K8sObject
  })
}

function makeServices(): K8sObject[] {
  return APPS.flatMap((app, index) =>
    NAMESPACES.map((namespace, offset) => {
      const seed = index * NAMESPACES.length + offset

      return {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: meta(app, seed, namespace),
        spec: {
          type: seed === 0 ? 'LoadBalancer' : seed % 7 === 0 ? 'NodePort' : 'ClusterIP',
          clusterIP: `10.96.${index}.${offset + 5}`,
          // A service with no selector is the "selects nothing" case the
          // topology paints as a warning.
          selector: seed % 11 === 0 ? undefined : appLabels(app),
          ports: [{ port: 80, protocol: 'TCP', nodePort: seed % 7 === 0 ? 30000 + seed : undefined }],
        },
        status: seed === 0 ? { loadBalancer: { ingress: [{ ip: '10.20.0.200' }] } } : {},
      }
    }),
  )
}

const ROUTES: Array<[string, string, string]> = [
  ['public', 'default', 'api-gateway'],
  ['auth', 'default', 'auth-svc'],
  ['metrics', 'monitoring', 'otel-collector'],
  ['checkout', 'default', 'checkout'],
]

function makeIngresses(): K8sObject[] {
  return ROUTES.map(([name, namespace, service], index) => ({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: meta(name, index, namespace),
    spec: {
      ingressClassName: 'nginx',
      rules: [
        {
          host: `${name}.nens.internal`,
          http: {
            paths: [
              {
                path: '/',
                pathType: 'Prefix',
                backend: { service: { name: service, port: { number: 80 } } },
              },
            ],
          },
        },
      ],
    },
  }))
}

/** One per namespace, because a pod's env reads the one beside it. */
function makeConfigMaps(): K8sObject[] {
  return APPS.flatMap((app, index) =>
    NAMESPACES.map((namespace, offset) => ({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: meta(`${app}-config`, index * NAMESPACES.length + offset, namespace),
      data: {
        'app.yaml': 'log_level: info\n',
        'features.json': '{"beta":false}',
        LOG_FORMAT: 'json',
        MAX_WORKERS: '8',
      },
    })),
  )
}

const base64 = (value: string) => btoa(value)

function makeSecrets(): K8sObject[] {
  return APPS.flatMap((app, index) =>
    NAMESPACES.map((namespace, offset) => ({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: meta(`${app}-db`, index * NAMESPACES.length + offset, namespace),
      type: 'Opaque',
      data: {
        password: base64(`s3cr3t-${app}-${offset}`),
        'connection-string': base64(`postgres://${app}:s3cr3t@postgres.${namespace}:5432/${app}`),
      },
    })),
  ) as K8sObject[]
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
  replicasets: makeReplicaSets,
  statefulsets: makeStatefulSets,
  daemonsets: makeDaemonSets,
  nodes: makeNodes,
  events: makeEvents,
  services: makeServices,
  ingresses: makeIngresses,
  configmaps: makeConfigMaps,
  secrets: makeSecrets,
  definitions: makeDefinitions,
  'crd:argoproj.io/applications': makeApplications,
}

const cache = new Map<string, K8sObject[]>()

export function fixtureObjects(kindId: string): K8sObject[] {
  if (!cache.has(kindId)) cache.set(kindId, BUILDERS[kindId]?.() ?? [])
  return cache.get(kindId) ?? []
}

const apps = (resource: string) => ({ group: 'apps', version: 'v1', resource })

const RESOURCE_OF: Record<string, string> = {
  ReplicaSet: 'replicasets',
  StatefulSet: 'statefulsets',
  DaemonSet: 'daemonsets',
  Deployment: 'deployments',
}

export function fixtureOwners(object: K8sObject): OwnerRef[] {
  const owner = object.metadata.ownerReferences?.[0]
  if (!owner) return []

  const namespace = object.metadata.namespace ?? ''
  const chain: OwnerRef[] = [
    {
      gvr: apps(RESOURCE_OF[owner.kind] ?? 'replicasets'),
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
