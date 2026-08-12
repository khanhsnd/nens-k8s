import * as Menu from '@radix-ui/react-dropdown-menu'
import { Copy, MoreHorizontal, Scaling, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { copyText } from '@/shared/lib/clipboard'
import { Dialog } from '@/shared/ui/Dialog'
import { deleteObject, scaleObject } from './object.api'
import type { K8sObject, ResourceRef } from './resource.types'

function Item({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return (
    <Menu.Item
      onSelect={onSelect}
      className="flex cursor-default items-center gap-2 rounded px-2 py-1.5 text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-text"
    >
      <Icon className="size-3.5" />
      {label}
    </Menu.Item>
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
  onDeleted,
}: {
  target: ResourceRef
  object: K8sObject
  onDeleted: () => void
}) {
  const [dialog, setDialog] = useState<'delete' | 'scale' | null>(null)
  const replicas = object.spec?.replicas

  return (
    <>
      <Menu.Root>
        <Menu.Trigger className="grid size-7 place-items-center rounded-md text-muted outline-none transition-colors hover:bg-raised hover:text-text">
          <MoreHorizontal className="size-4" />
        </Menu.Trigger>

        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={4}
            className="z-50 min-w-44 rounded-md border border-line-strong bg-overlay p-1 text-[12px] shadow-xl"
          >
            {typeof replicas === 'number' && (
              <Item icon={Scaling} label="Scale…" onSelect={() => setDialog('scale')} />
            )}
            <Item icon={Copy} label="Copy name" onSelect={() => void copyText(target.name)} />
            <Item icon={Trash2} label="Delete…" onSelect={() => setDialog('delete')} />
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>

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
