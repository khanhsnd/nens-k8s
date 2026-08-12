import { CONFIGMAP_COLUMNS } from './configmap.columns'
import { CRD_COLUMNS } from './crd.columns'
import { DEPLOYMENT_COLUMNS } from './deployment.columns'
import { NODE_COLUMNS } from './node.columns'
import { POD_COLUMNS } from './pod.columns'
import { SERVICE_COLUMNS } from './service.columns'
import type { GVR, ResourceColumn } from './resource.types'

/**
 * What a built-in nav leaf declares. The version and the scope are only the
 * offline fallback — discovery overrides both, because `autoscaling/v2` is
 * `autoscaling/v1` on an older cluster.
 */
export type KindSpec = {
  gvr: GVR
  namespaced: boolean
  /** A kind with no table of its own falls back to generic columns. */
  columns?: ResourceColumn[]
  /** Owns pods, so the bottom panel can stream its logs. */
  logs?: boolean
  /** Owns containers, so the bottom panel can attach a shell. */
  shell?: boolean
  /** A node: its shell is a privileged pod entering the host's namespaces. */
  nodeShell?: boolean
  /** Owns pods with ports, so a local port can be forwarded to it. */
  forward?: boolean
}

/** A spec resolved against a cluster: the columns are always there. */
export type Kind = KindSpec & {
  id: string
  columns: ResourceColumn[]
}

const core = (resource: string): GVR => ({ group: '', version: 'v1', resource })

const at = (group: string, version: string, resource: string): GVR => ({ group, version, resource })

export const KINDS: Record<string, KindSpec> = {
  nodes: { gvr: core('nodes'), namespaced: false, columns: NODE_COLUMNS, nodeShell: true },
  namespaces: { gvr: core('namespaces'), namespaced: false },
  events: { gvr: core('events'), namespaced: true },

  pods: {
    gvr: core('pods'),
    namespaced: true,
    columns: POD_COLUMNS,
    logs: true,
    shell: true,
    forward: true,
  },
  deployments: {
    gvr: at('apps', 'v1', 'deployments'),
    namespaced: true,
    columns: DEPLOYMENT_COLUMNS,
    logs: true,
    forward: true,
  },
  daemonsets: { gvr: at('apps', 'v1', 'daemonsets'), namespaced: true, logs: true, forward: true },
  statefulsets: {
    gvr: at('apps', 'v1', 'statefulsets'),
    namespaced: true,
    logs: true,
    forward: true,
  },
  replicasets: { gvr: at('apps', 'v1', 'replicasets'), namespaced: true, logs: true },
  jobs: { gvr: at('batch', 'v1', 'jobs'), namespaced: true, logs: true },
  cronjobs: { gvr: at('batch', 'v1', 'cronjobs'), namespaced: true },

  configmaps: { gvr: core('configmaps'), namespaced: true, columns: CONFIGMAP_COLUMNS },
  secrets: { gvr: core('secrets'), namespaced: true },
  resourcequotas: { gvr: core('resourcequotas'), namespaced: true },
  limitranges: { gvr: core('limitranges'), namespaced: true },
  hpa: { gvr: at('autoscaling', 'v2', 'horizontalpodautoscalers'), namespaced: true },
  pdb: { gvr: at('policy', 'v1', 'poddisruptionbudgets'), namespaced: true },
  priorityclasses: { gvr: at('scheduling.k8s.io', 'v1', 'priorityclasses'), namespaced: false },

  services: { gvr: core('services'), namespaced: true, columns: SERVICE_COLUMNS, forward: true },
  endpoints: { gvr: core('endpoints'), namespaced: true },
  ingresses: { gvr: at('networking.k8s.io', 'v1', 'ingresses'), namespaced: true },
  ingressclasses: { gvr: at('networking.k8s.io', 'v1', 'ingressclasses'), namespaced: false },
  networkpolicies: { gvr: at('networking.k8s.io', 'v1', 'networkpolicies'), namespaced: true },

  pvc: { gvr: core('persistentvolumeclaims'), namespaced: true },
  pv: { gvr: core('persistentvolumes'), namespaced: false },
  storageclasses: { gvr: at('storage.k8s.io', 'v1', 'storageclasses'), namespaced: false },

  serviceaccounts: { gvr: core('serviceaccounts'), namespaced: true },
  clusterroles: { gvr: at('rbac.authorization.k8s.io', 'v1', 'clusterroles'), namespaced: false },
  roles: { gvr: at('rbac.authorization.k8s.io', 'v1', 'roles'), namespaced: true },
  clusterrolebindings: {
    gvr: at('rbac.authorization.k8s.io', 'v1', 'clusterrolebindings'),
    namespaced: false,
  },
  rolebindings: { gvr: at('rbac.authorization.k8s.io', 'v1', 'rolebindings'), namespaced: true },

  definitions: {
    gvr: at('apiextensions.k8s.io', 'v1', 'customresourcedefinitions'),
    namespaced: false,
    columns: CRD_COLUMNS,
  },
}
