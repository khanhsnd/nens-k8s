import { AGE_COLUMN, NAME_COLUMN, NAMESPACE_COLUMN } from './common.columns'
import type { K8sObject, ResourceColumn } from './resource.types'

function externalIP(service: K8sObject): string {
  const ingress = (service.status?.loadBalancer?.ingress ?? []).map(
    (entry: any) => entry.ip ?? entry.hostname,
  )
  const external = [...ingress, ...(service.spec?.externalIPs ?? [])].filter(Boolean)
  if (external.length > 0) return external.join(', ')
  return service.spec?.type === 'LoadBalancer' ? 'pending' : '—'
}

function ports(service: K8sObject): string {
  return (
    (service.spec?.ports ?? [])
      .map((port: any) =>
        port.nodePort
          ? `${port.port}:${port.nodePort}/${port.protocol}`
          : `${port.port}/${port.protocol}`,
      )
      .join(', ') || '—'
  )
}

export const SERVICE_COLUMNS: ResourceColumn[] = [
  NAME_COLUMN,
  NAMESPACE_COLUMN,
  { key: 'type', label: 'Type', min: 100, grow: 0.5, text: (row) => row.spec?.type ?? 'ClusterIP' },
  {
    key: 'clusterIP',
    label: 'Cluster IP',
    min: 110,
    grow: 0.6,
    text: (row) => row.spec?.clusterIP ?? '—',
  },
  { key: 'externalIP', label: 'External IP', min: 120, grow: 0.7, text: externalIP },
  { key: 'ports', label: 'Ports', min: 140, grow: 1, text: ports },
  AGE_COLUMN,
]
