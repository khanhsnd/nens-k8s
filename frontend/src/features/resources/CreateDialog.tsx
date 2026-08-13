import { useState } from 'react'
import { parse } from 'yaml'
import { useClusters } from '@/features/clusters/cluster.store'
import { CodeEditor } from '@/shared/ui/CodeEditor'
import { Dialog } from '@/shared/ui/Dialog'
import type { Kind } from './kinds'
import { applyObject } from './object.api'
import type { K8sObject } from './resource.types'
import { objectTemplate } from './templates'

/**
 * Creating is the same server-side apply the YAML tab does — apply with `force`
 * creates what is not there yet — so a new object needs no new binding, only a
 * ref built from what the document says it is.
 *
 * Nothing here refreshes the table: the informer is already watching, so the row
 * arrives on its own.
 */
export function CreateDialog({
  kind,
  namespace,
  onClose,
}: {
  kind: Kind
  namespace: string
  onClose: () => void
}) {
  const clusterId = useClusters((state) => state.activeId)
  const [text, setText] = useState(() => objectTemplate(kind, namespace))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    let object: K8sObject
    try {
      object = parse(text) as K8sObject
    } catch (failure) {
      setError(String(failure))
      return
    }

    if (!object?.metadata?.name) {
      setError('metadata.name is required')
      return
    }
    // The endpoint comes from the table, not from the document, so a pasted
    // object of another kind would be applied to the wrong one.
    if (object.kind && object.kind !== kind.kind) {
      setError(`This creates a ${kind.kind}, but the document is a ${object.kind}`)
      return
    }
    if (!clusterId) {
      setError('No cluster is selected')
      return
    }

    setBusy(true)
    setError(null)
    try {
      await applyObject(
        {
          clusterId,
          gvr: kind.gvr,
          namespace: kind.namespaced ? (object.metadata.namespace ?? namespace) : '',
          name: object.metadata.name,
          uid: '',
        },
        object,
      )
      onClose()
    } catch (failure) {
      setError(String(failure))
      setBusy(false)
    }
  }

  return (
    <Dialog title={`New ${kind.kind}`} onClose={onClose}>
      <div className="flex h-[420px] flex-col border-b border-line">
        <CodeEditor value={text} onChange={setText} onSave={() => void create()} />
      </div>

      <div className="space-y-3 p-4">
        {error && <p className="font-mono text-xs text-danger">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-faint">
            Server-side apply as `nens` · Ctrl+S
          </span>
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={() => void create()}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-opacity disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
