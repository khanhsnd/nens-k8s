import { Dialog } from '@/shared/ui/Dialog'
import { useEditorGuard } from './editor.store'

export function DiscardGuard() {
  const pending = useEditorGuard((s) => s.pending)
  const discard = useEditorGuard((s) => s.discard)
  const keep = useEditorGuard((s) => s.keep)

  if (!pending) return null

  return (
    <Dialog title="Discard unsaved changes?" onClose={keep}>
      <div className="space-y-4 p-4">
        <p className="text-[12px] text-muted">
          The YAML editor has edits that were never applied to the cluster.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={keep}
            className="rounded-md px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Keep editing
          </button>
          <button
            onClick={discard}
            className="rounded-md bg-danger px-3 py-1.5 text-[12px] font-medium text-base"
          >
            Discard
          </button>
        </div>
      </div>
    </Dialog>
  )
}
