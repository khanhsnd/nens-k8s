import type { ApiResource, PrinterColumn } from './discovery.types'

/** `[resource, kind, namespaced]` — the shape a discovery answer is, minus the noise. */
type Served = [string, string, boolean]

const BUILT_INS: Record<string, Served[]> = {
  v1: [
    ['configmaps', 'ConfigMap', true],
    ['endpoints', 'Endpoints', true],
    ['events', 'Event', true],
    ['limitranges', 'LimitRange', true],
    ['namespaces', 'Namespace', false],
    ['nodes', 'Node', false],
    ['persistentvolumeclaims', 'PersistentVolumeClaim', true],
    ['persistentvolumes', 'PersistentVolume', false],
    ['pods', 'Pod', true],
    ['resourcequotas', 'ResourceQuota', true],
    ['secrets', 'Secret', true],
    ['serviceaccounts', 'ServiceAccount', true],
    ['services', 'Service', true],
  ],
  'apps/v1': [
    ['daemonsets', 'DaemonSet', true],
    ['deployments', 'Deployment', true],
    ['replicasets', 'ReplicaSet', true],
    ['statefulsets', 'StatefulSet', true],
  ],
  'apiextensions.k8s.io/v1': [['customresourcedefinitions', 'CustomResourceDefinition', false]],
  'autoscaling/v2': [['horizontalpodautoscalers', 'HorizontalPodAutoscaler', true]],
  'batch/v1': [
    ['cronjobs', 'CronJob', true],
    ['jobs', 'Job', true],
  ],
  'networking.k8s.io/v1': [
    ['ingressclasses', 'IngressClass', false],
    ['ingresses', 'Ingress', true],
    ['networkpolicies', 'NetworkPolicy', true],
  ],
  'policy/v1': [['poddisruptionbudgets', 'PodDisruptionBudget', true]],
  'rbac.authorization.k8s.io/v1': [
    ['clusterrolebindings', 'ClusterRoleBinding', false],
    ['clusterroles', 'ClusterRole', false],
    ['rolebindings', 'RoleBinding', true],
    ['roles', 'Role', true],
  ],
  'scheduling.k8s.io/v1': [['priorityclasses', 'PriorityClass', false]],
  'storage.k8s.io/v1': [['storageclasses', 'StorageClass', false]],
}

const column = (name: string, jsonPath: string, priority = 0): PrinterColumn => ({
  name,
  type: 'string',
  jsonPath,
  priority,
})

const CUSTOM: Record<string, Array<[string, string, boolean, PrinterColumn[]?]>> = {
  'argoproj.io/v1alpha1': [
    [
      'applications',
      'Application',
      true,
      [
        column('Sync Status', '.status.sync.status'),
        column('Health Status', '.status.health.status'),
        column('Revision', '.status.sync.revision', 1),
      ],
    ],
    ['appprojects', 'AppProject', true],
  ],
  'cert-manager.io/v1': [
    [
      'certificates',
      'Certificate',
      true,
      [
        column('Ready', '.status.conditions[0].status'),
        column('Secret', '.spec.secretName'),
        column('Issuer', '.spec.issuerRef.name', 1),
      ],
    ],
    ['clusterissuers', 'ClusterIssuer', false],
    ['issuers', 'Issuer', true],
  ],
  'monitoring.coreos.com/v1': [
    ['alertmanagers', 'Alertmanager', true],
    ['prometheuses', 'Prometheus', true, [column('Version', '.spec.version')]],
    ['servicemonitors', 'ServiceMonitor', true],
  ],
}

function flatten(
  source: Record<string, Array<[string, string, boolean, PrinterColumn[]?]>>,
  custom: boolean,
): ApiResource[] {
  return Object.entries(source).flatMap(([groupVersion, served]) => {
    const [group, version] = groupVersion.includes('/')
      ? groupVersion.split('/')
      : ['', groupVersion]

    return served.map(([resource, kind, namespaced, columns]) => ({
      gvr: { group, version, resource },
      kind,
      namespaced,
      custom,
      verbs: ['get', 'list', 'watch'],
      columns,
    }))
  })
}

export const FIXTURE_RESOURCES: ApiResource[] = [
  ...flatten(BUILT_INS, false),
  ...flatten(CUSTOM, true),
]
