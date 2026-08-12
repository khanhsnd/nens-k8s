import { Badge } from '@/shared/ui/Badge'
import { AGE_COLUMN, NAME_COLUMN, NAMESPACE_COLUMN } from './common.columns'
import type { K8sObject, ResourceColumn } from './resource.types'

function desired(deployment: K8sObject): number {
  return deployment.spec?.replicas ?? 0
}

function available(deployment: K8sObject): number {
  return deployment.status?.readyReplicas ?? 0
}

export const DEPLOYMENT_COLUMNS: ResourceColumn[] = [
  NAME_COLUMN,
  NAMESPACE_COLUMN,
  {
    key: 'ready',
    label: 'Ready',
    min: 70,
    grow: 0.4,
    text: (row) => `${available(row)}/${desired(row)}`,
    cell: (row) => (
      <Badge tone={available(row) === desired(row) ? 'ok' : 'warn'}>
        {available(row)}/{desired(row)}
      </Badge>
    ),
  },
  {
    key: 'updated',
    label: 'Up-to-date',
    min: 80,
    grow: 0.4,
    text: (row) => String(row.status?.updatedReplicas ?? 0),
  },
  {
    key: 'available',
    label: 'Available',
    min: 76,
    grow: 0.4,
    text: (row) => String(row.status?.availableReplicas ?? 0),
  },
  {
    key: 'images',
    label: 'Images',
    min: 200,
    grow: 1.8,
    text: (row) =>
      (row.spec?.template?.spec?.containers ?? [])
        .map((container: any) => container.image)
        .join(', ') || '—',
  },
  AGE_COLUMN,
]
