import { AGE_COLUMN, NAME_COLUMN } from './common.columns'
import type { K8sObject, ResourceColumn } from './resource.types'

function versions(crd: K8sObject): string {
  return (
    (crd.spec?.versions ?? [])
      .filter((version: any) => version.served)
      .map((version: any) => version.name)
      .join(', ') || '—'
  )
}

export const CRD_COLUMNS: ResourceColumn[] = [
  NAME_COLUMN,
  { key: 'group', label: 'Group', min: 160, grow: 1.2, text: (row) => row.spec?.group ?? '—' },
  { key: 'kind', label: 'Kind', min: 120, grow: 0.8, text: (row) => row.spec?.names?.kind ?? '—' },
  { key: 'versions', label: 'Versions', min: 110, grow: 0.6, text: versions },
  { key: 'scope', label: 'Scope', min: 90, grow: 0.4, text: (row) => row.spec?.scope ?? '—' },
  AGE_COLUMN,
]
