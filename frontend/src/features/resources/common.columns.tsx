import { age } from '@/shared/lib/format'
import type { ResourceColumn } from './resource.types'

export const NAME_COLUMN: ResourceColumn = {
  key: 'name',
  label: 'Name',
  min: 220,
  grow: 2.4,
  fixed: true,
  text: (row) => row.metadata.name,
  cell: (row) => <span className="font-medium text-text">{row.metadata.name}</span>,
}

export const NAMESPACE_COLUMN: ResourceColumn = {
  key: 'namespace',
  label: 'Namespace',
  min: 110,
  grow: 1,
  text: (row) => row.metadata.namespace ?? '—',
}

export const AGE_COLUMN: ResourceColumn = {
  key: 'age',
  label: 'Age',
  min: 48,
  grow: 0.3,
  text: (row) => (row.metadata.creationTimestamp ? age(row.metadata.creationTimestamp) : '—'),
}
