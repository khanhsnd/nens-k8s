import { Copy, Scaling, ScrollText, SquareTerminal, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { openLogsTool, openNodeShellTool, openShellTool } from '@/features/dock/dock.store'
import { cn } from '@/shared/lib/cn'
import { copyText } from '@/shared/lib/clipboard'
import { Dialog } from '@/shared/ui/Dialog'
import { Tooltip } from '@/shared/ui/Tooltip'
import type { Kind } from './kinds'
import { deleteObject, scaleObject } from './object.api'
import type { K8sObject, ResourceRef } from './resource.types'

function Action({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: LucideIcon
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        onClick={onClick}
        className={cn(
          'grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-raised',
          danger ? 'hover:text-danger' : 'hover:text-text',
        )}
      >
        <Icon className="size-4" />
      </button>
    </Tooltip>
  )
}

function DeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: ResourceRef
  onClose: () => void
  onDeleted: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    try {
      await deleteObject(target)
      onDeleted()
    } catch (failure) {
      setError(String(failure))
    }
  }

  return (
    <Dialog title={`Delete ${target.name}?`} onClose={onClose}>
      <div className="space-y-4 p-4">
        <p className="text-[12px] text-muted">
          {target.namespace ? `${target.gvr.resource} in ${target.namespace}` : target.gvr.resource}{' '}
          — this cannot be undone.
        </p>
        {error && <p className="font-mono text-[11px] text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={() => void remove()}
            className="rounded-md bg-danger px-3 py-1.5 text-[12px] font-medium text-base"
          >
            Delete
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function ScaleDialog({
  target,
  current,
  onClose,
}: {
  target: ResourceRef
  current: number
  onClose: () => void
}) {
  const [replicas, setReplicas] = useState(String(current))
  const [error, setError] = useState<string | null>(null)

  const wanted = Number(replicas)
  const valid = Number.isInteger(wanted) && wanted >= 0 && wanted !== current

  const save = async () => {
    try {
      await scaleObject(target, wanted)
      onClose()
    } catch (failure) {
      setError(String(failure))
    }
  }

  return (
    <Dialog title={`Scale ${target.name}`} onClose={onClose}>
      <div className="space-y-3 p-4">
        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-wide text-faint">Replicas</span>
          <input
            autoFocus
            type="number"
            min={0}
            value={replicas}
            onChange={(event) => setReplicas(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && valid && void save()}
            className="w-full rounded-md border border-line bg-base px-2.5 py-1.5 text-[12px] text-text outline-none focus:border-accent/60"
          />
        </label>
        <p className="text-[11.5px] text-faint">Currently {current}.</p>
        {error && <p className="font-mono text-[11px] text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!valid}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-base transition-opacity disabled:opacity-40"
          >
            Scale
          </button>
        </div>
      </div>
    </Dialog>
  )
}

export function ObjectActions({
  target,
  object,
  kind,
  onDeleted,
}: {
  target: ResourceRef
  object: K8sObject
  kind: Kind
  onDeleted: () => void
}) {
  const [dialog, setDialog] = useState<'delete' | 'scale' | null>(null)
  const replicas = object.spec?.replicas

  return (
    <>
      {kind.logs && (
        <Action icon={ScrollText} label="Logs" onClick={() => openLogsTool(target)} />
      )}
      {kind.shell && (
        <Action icon={SquareTerminal} label="Shell" onClick={() => openShellTool(target)} />
      )}
      {kind.nodeShell && (
        <Action
          icon={SquareTerminal}
          label="Node shell"
          onClick={() => openNodeShellTool(target)}
        />
      )}
      {typeof replicas === 'number' && (
        <Action icon={Scaling} label="Scale…" onClick={() => setDialog('scale')} />
      )}
      <Action icon={Copy} label="Copy name" onClick={() => void copyText(target.name)} />
      <Action icon={Trash2} label="Delete…" danger onClick={() => setDialog('delete')} />

      {dialog === 'delete' && (
        <DeleteDialog
          target={target}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null)
            onDeleted()
          }}
        />
      )}
      {dialog === 'scale' && typeof replicas === 'number' && (
        <ScaleDialog target={target} current={replicas} onClose={() => setDialog(null)} />
      )}
    </>
  )
}
