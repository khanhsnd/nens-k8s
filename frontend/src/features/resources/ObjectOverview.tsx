import { CornerDownRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ForwardPanel } from '@/features/portforward/ForwardPanel'
import type { Kind } from './kinds'
import { listOwners } from './object.api'
import type { K8sObject, OwnerRef, ResourceRef } from './resource.types'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 py-1.5">
      <dt className="text-faint">{label}</dt>
      <dd className="truncate font-mono text-[12px]">{value}</dd>
    </div>
  )
}

function Heading({ children }: { children: string }) {
  return <div className="text-[11px] uppercase tracking-wide text-faint">{children}</div>
}

function OwnerChain({ owners }: { owners: OwnerRef[] }) {
  return (
    <div className="mt-4 space-y-1.5">
      <Heading>Owned by</Heading>
      <ol>
        {owners.map((owner, index) => (
          <li
            key={owner.uid}
            style={{ paddingLeft: index * 16 }}
            className="flex items-center gap-1.5 py-0.5 text-[12px]"
          >
            {index > 0 && <CornerDownRight className="size-3 shrink-0 text-faint" />}
            <span className="shrink-0 text-faint">{owner.kind}</span>
            <span className="truncate font-mono">{owner.name}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function ObjectOverview({
  object,
  kind,
  target,
}: {
  object: K8sObject
  kind: Kind
  target: ResourceRef
}) {
  const [owners, setOwners] = useState<OwnerRef[]>([])
  const labels = Object.entries(object.metadata.labels ?? {})

  useEffect(() => {
    let live = true
    setOwners([])
    listOwners(target)
      .then((chain) => live && setOwners(chain))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [target])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <dl className="text-[12px]">
        <Field label="Kind" value={object.kind ?? '—'} />
        {kind.columns
          .filter((column) => column.key !== 'name' && column.text(object) !== '')
          .map((column) => (
            <Field key={column.key} label={column.label} value={column.text(object)} />
          ))}
        <Field label="UID" value={object.metadata.uid} />
      </dl>

      {kind.forward && <ForwardPanel target={target} />}

      {owners.length > 0 && <OwnerChain owners={owners} />}

      {labels.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <Heading>Labels</Heading>
          <div className="flex flex-wrap gap-1">
            {labels.map(([key, value]) => (
              <span
                key={key}
                className="truncate rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted"
              >
                {key}={value}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
