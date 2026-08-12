import { useState } from 'react'
import { Dialog } from '@/shared/ui/Dialog'
import { useClusters } from './cluster.store'
import type { Cluster } from './cluster.types'

const DETAILS: { label: string; value: (cluster: Cluster) => string }[] = [
  { label: 'Context', value: (cluster) => cluster.context },
  { label: 'Server', value: (cluster) => cluster.server },
  { label: 'User', value: (cluster) => cluster.user },
  { label: 'Namespace', value: (cluster) => cluster.namespace },
  { label: 'Version', value: (cluster) => cluster.version || '—' },
]

export function ClusterSettingsDialog({
  cluster,
  onClose,
}: {
  cluster: Cluster
  onClose: () => void
}) {
  const rename = useClusters((s) => s.rename)
  const [name, setName] = useState(cluster.name)
  const [error, setError] = useState<string | null>(null)

  const changed = name.trim() !== '' && name.trim() !== cluster.name

  const save = async () => {
    try {
      await rename(cluster.id, name)
      onClose()
    } catch (failure) {
      setError(String(failure))
    }
  }

  return (
    <Dialog title="Cluster settings" onClose={onClose}>
      <div className="space-y-3 p-4">
        <label className="block space-y-1.5">
          <span className="text-[10px] uppercase tracking-wide text-faint">Display name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && changed && void save()}
            className="w-full rounded-md border border-line bg-base px-2.5 py-1.5 text-[12px] text-text outline-none focus:border-accent/60"
          />
        </label>
        <p className="text-[11.5px] text-faint">
          Only the label shown in Nens — the kubeconfig context stays {cluster.context}.
        </p>

        <dl className="border-t border-line pt-2 text-[12px]">
          {DETAILS.map((detail) => (
            <div key={detail.label} className="grid grid-cols-[90px_1fr] gap-3 py-1">
              <dt className="text-faint">{detail.label}</dt>
              <dd className="truncate font-mono text-muted">{detail.value(cluster)}</dd>
            </div>
          ))}
        </dl>

        {error && <p className="text-[11.5px] text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-[12px] text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!changed}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-base transition-opacity disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  )
}
