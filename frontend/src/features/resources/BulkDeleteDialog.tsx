import { useState } from 'react'
import { Dialog } from '@/shared/ui/Dialog'
import type { Kind } from './kinds'
import { deleteObject, refOf } from './object.api'
import type { K8sObject } from './resource.types'

const LISTED = 12

/**
 * Deleting what the tick boxes hold. Each object is its own request — the API has
 * no batch delete — so a failure is per object and the ones that worked stay gone.
 */
export function BulkDeleteDialog({
  kind,
  clusterId,
  objects,
  onClose,
  onDeleted,
}: {
  kind: Kind
  clusterId: string
  objects: K8sObject[]
  onClose: () => void
  onDeleted: (deleted: string[]) => void
}) {
  const [busy, setBusy] = useState(false)
  const [failures, setFailures] = useState<string[]>([])

  const remove = async () => {
    setBusy(true)
    setFailures([])

    const deleted: string[] = []
    const failed: string[] = []

    for (const object of objects) {
      try {
        await deleteObject(refOf(clusterId, kind, object))
        deleted.push(object.metadata.uid)
      } catch (error) {
        failed.push(`${object.metadata.name}: ${error}`)
      }
    }

    setBusy(false)
    onDeleted(deleted)
    if (failed.length > 0) setFailures(failed)
    else onClose()
  }

  return (
    <Dialog title={`Delete ${objects.length} ${kind.id}?`} onClose={onClose}>
      <div className="space-y-4 p-4">
        <ul className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs text-muted">
          {objects.slice(0, LISTED).map((object) => (
            <li key={object.metadata.uid} className="truncate">
              {object.metadata.namespace ? `${object.metadata.namespace}/` : ''}
              {object.metadata.name}
            </li>
          ))}
          {objects.length > LISTED && (
            <li className="text-faint">and {objects.length - LISTED} more…</li>
          )}
        </ul>

        <p className="text-sm text-muted">This cannot be undone.</p>

        {failures.length > 0 && (
          <ul className="max-h-32 space-y-0.5 overflow-y-auto font-mono text-xs text-danger">
            {failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
          >
            {failures.length > 0 ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={() => void remove()}
            disabled={busy}
            className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-base transition-opacity disabled:opacity-40"
          >
            {busy ? 'Deleting…' : `Delete ${objects.length}`}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
