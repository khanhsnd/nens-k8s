import { CONFIGMAP_COLUMNS } from './configmap.columns'
import { DEPLOYMENT_COLUMNS } from './deployment.columns'
import { NODE_COLUMNS } from './node.columns'
import { POD_COLUMNS } from './pod.columns'
import { SERVICE_COLUMNS } from './service.columns'
import type { GVR, ResourceColumn } from './resource.types'

export type Kind = {
  id: string
  gvr: GVR
  namespaced: boolean
  columns: ResourceColumn[]
  /** Owns pods, so the bottom panel can stream its logs. */
  logs?: boolean
  /** Owns containers, so the bottom panel can attach a shell. */
  shell?: boolean
  /** A node: its shell is a privileged pod entering the host's namespaces. */
  nodeShell?: boolean
  /** Owns pods with ports, so a local port can be forwarded to it. */
  forward?: boolean
}

const core = (resource: string): GVR => ({ group: '', version: 'v1', resource })

export const KINDS: Record<string, Kind> = {
  pods: {
    id: 'pods',
    gvr: core('pods'),
    namespaced: true,
    columns: POD_COLUMNS,
    logs: true,
    shell: true,
    forward: true,
  },
  nodes: {
    id: 'nodes',
    gvr: core('nodes'),
    namespaced: false,
    columns: NODE_COLUMNS,
    nodeShell: true,
  },
  services: {
    id: 'services',
    gvr: core('services'),
    namespaced: true,
    columns: SERVICE_COLUMNS,
    forward: true,
  },
  configmaps: {
    id: 'configmaps',
    gvr: core('configmaps'),
    namespaced: true,
    columns: CONFIGMAP_COLUMNS,
  },
  deployments: {
    id: 'deployments',
    gvr: { group: 'apps', version: 'v1', resource: 'deployments' },
    namespaced: true,
    columns: DEPLOYMENT_COLUMNS,
    logs: true,
    forward: true,
  },
}

export function kindFor(leafId: string): Kind | null {
  return KINDS[leafId] ?? null
}
