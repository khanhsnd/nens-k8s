import { AGE_COLUMN, NAME_COLUMN, NAMESPACE_COLUMN } from './common.columns'
import type { ResourceColumn } from './resource.types'

export const CONFIGMAP_COLUMNS: ResourceColumn[] = [
  NAME_COLUMN,
  NAMESPACE_COLUMN,
  {
    key: 'keys',
    label: 'Keys',
    min: 220,
    grow: 2,
    text: (row) => Object.keys(row.data ?? {}).join(', ') || '—',
  },
  {
    key: 'count',
    label: 'Count',
    min: 56,
    grow: 0.3,
    text: (row) => String(Object.keys(row.data ?? {}).length),
  },
  AGE_COLUMN,
]
