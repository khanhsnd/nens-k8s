import { useMemo } from 'react'
import { useUsage, withUsage } from '@/features/metrics/usage'
import { Placeholder } from '@/shared/ui/Placeholder'
import type { Kind } from './kinds'
import { useResources } from './resource.store'
import type { K8sObject } from './resource.types'
import { ResourceTable } from './ResourceTable'

function compare(a: K8sObject, b: K8sObject) {
  return (
    (a.metadata.namespace ?? '').localeCompare(b.metadata.namespace ?? '') ||
    a.metadata.name.localeCompare(b.metadata.name)
  )
}

export function ResourceView({
  kind,
  sliceKey,
  selectedUid,
  onSelect,
}: {
  kind: Kind
  sliceKey: string
  selectedUid: string | null
  onSelect: (row: K8sObject) => void
}) {
  const slice = useResources((state) => state.slices[sliceKey])
  const objects = slice?.objects
  const usage = useUsage(kind)

  const rows = useMemo(
    () => [...(objects?.values() ?? [])].sort(compare).map((row) => withUsage(usage, row)),
    [objects, usage],
  )

  if (!slice) return <Placeholder label={`Connect a cluster to load ${kind.id}`} />

  const notice = slice.error ? (
    <span className="text-danger">{slice.error}</span>
  ) : slice.synced ? null : (
    <span className="text-faint">syncing…</span>
  )

  return (
    <ResourceTable
      kind={kind}
      rows={rows}
      selectedUid={selectedUid}
      onSelect={onSelect}
      notice={notice}
    />
  )
}
