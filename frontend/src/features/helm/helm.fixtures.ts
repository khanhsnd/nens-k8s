import type { HelmDetail, HelmRef, HelmRelease, HelmStatus } from './helm.types'

type Seed = {
  name: string
  namespace: string
  chart: string
  chartVersion: string
  appVersion: string
  revisions: number
  status: HelmStatus
}

const SEEDS: Seed[] = [
  {
    name: 'ingress-nginx',
    namespace: 'ingress-nginx',
    chart: 'ingress-nginx',
    chartVersion: '4.11.3',
    appVersion: '1.11.3',
    revisions: 3,
    status: 'deployed',
  },
  {
    name: 'kube-prometheus-stack',
    namespace: 'monitoring',
    chart: 'kube-prometheus-stack',
    chartVersion: '65.1.1',
    appVersion: '0.77.1',
    revisions: 5,
    status: 'deployed',
  },
  {
    name: 'redis',
    namespace: 'cache',
    chart: 'redis',
    chartVersion: '20.1.0',
    appVersion: '7.4.1',
    revisions: 2,
    status: 'failed',
  },
  {
    name: 'nens-demo',
    namespace: 'demo',
    chart: 'nens',
    chartVersion: '0.4.0',
    appVersion: '0.4.0',
    revisions: 1,
    status: 'pending-upgrade',
  },
]

const HOUR = 3_600_000

const seedOf = (ref: HelmRef) =>
  SEEDS.find((seed) => seed.name === ref.name && seed.namespace === ref.namespace)

function release(clusterId: string, seed: Seed, revision: number): HelmRelease {
  const latest = revision === seed.revisions

  return {
    clusterId,
    namespace: seed.namespace,
    name: seed.name,
    revision,
    status: latest ? seed.status : 'superseded',
    chart: seed.chart,
    chartVersion: seed.chartVersion,
    appVersion: seed.appVersion,
    updated: new Date(Date.now() - (seed.revisions - revision) * 26 * HOUR - 2 * HOUR).toISOString(),
    description:
      seed.status === 'failed' && latest
        ? `Upgrade "${seed.name}" failed: timed out waiting for the condition`
        : revision === 1
          ? 'Install complete'
          : 'Upgrade complete',
  }
}

/** Values that move between revisions, so the diff view has something to show. */
function values(seed: Seed, revision: number): string {
  return [
    `replicaCount: ${revision}`,
    'image:',
    `  repository: ${seed.chart}`,
    `  tag: ${seed.appVersion}`,
    '  pullPolicy: IfNotPresent',
    'resources:',
    '  requests:',
    `    cpu: ${50 * revision}m`,
    '    memory: 128Mi',
    ...(revision > 1 ? ['  limits:', `    cpu: ${200 * revision}m`, '    memory: 512Mi'] : []),
    'service:',
    '  type: ClusterIP',
    '  port: 80',
    '',
  ].join('\n')
}

function manifest(seed: Seed, revision: number): string {
  return [
    '---',
    '# Source: chart/templates/deployment.yaml',
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    `  name: ${seed.name}`,
    `  namespace: ${seed.namespace}`,
    '  labels:',
    `    app.kubernetes.io/name: ${seed.chart}`,
    `    app.kubernetes.io/version: "${seed.appVersion}"`,
    'spec:',
    `  replicas: ${revision}`,
    '  template:',
    '    spec:',
    '      containers:',
    `        - name: ${seed.chart}`,
    `          image: ${seed.chart}:${seed.appVersion}`,
    '          resources:',
    '            requests:',
    `              cpu: ${50 * revision}m`,
    '              memory: 128Mi',
    '',
  ].join('\n')
}

export function fixtureReleases(clusterId: string): HelmRelease[] {
  return SEEDS.map((seed) => release(clusterId, seed, seed.revisions))
}

export function fixtureHistory(ref: HelmRef): HelmRelease[] {
  const seed = seedOf(ref)
  if (!seed) return []

  return Array.from({ length: seed.revisions }, (_, index) =>
    release(ref.clusterId, seed, seed.revisions - index),
  )
}

export function fixtureDetail(ref: HelmRef, revision: number): HelmDetail {
  const seed = seedOf(ref)
  if (!seed) throw new Error(`release ${ref.namespace}/${ref.name} not found`)

  const wanted = revision === 0 ? seed.revisions : revision

  return {
    release: release(ref.clusterId, seed, wanted),
    values: values(seed, wanted),
    manifest: manifest(seed, wanted),
    notes: `${seed.chart} has been installed as ${seed.name}.\n\nGet the application URL:\n  kubectl --namespace ${seed.namespace} port-forward svc/${seed.name} 8080:80\n`,
  }
}
