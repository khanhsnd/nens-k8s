import { useState } from 'react'
import { copyText } from '@/shared/lib/clipboard'
import { Dialog } from '@/shared/ui/Dialog'
import { ErrorText } from '@/shared/ui/ErrorText'
import { useClusters } from './cluster.store'
import type { Cluster } from './cluster.types'

const DETAILS: { label: string; value: (cluster: Cluster) => string }[] = [
  { label: 'Context', value: (cluster) => cluster.context },
  { label: 'Server', value: (cluster) => cluster.server },
  { label: 'User', value: (cluster) => cluster.user },
  { label: 'Namespace', value: (cluster) => cluster.namespace },
  { label: 'Version', value: (cluster) => cluster.version },
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
          <span className="text-2xs uppercase tracking-wide text-faint">Display name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && changed && void save()}
            className="w-full rounded-md border border-line bg-base px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent/60"
          />
        </label>
        <p className="text-xs text-faint">
          Only the label shown in Nens — the kubeconfig context stays {cluster.context}.
        </p>

        <dl className="border-t border-line pt-2 text-sm">
          {DETAILS.map((detail) => {
            const value = detail.value(cluster)
            return (
              <div key={detail.label} className="grid grid-cols-[90px_1fr] gap-3 py-1">
                <dt className="text-faint">{detail.label}</dt>
                <dd className="min-w-0 font-mono text-muted">
                  {value ? (
                    <button
                      title="Copy"
                      onClick={() => void copyText(value)}
                      className="block w-full truncate text-left transition-colors hover:text-text"
                    >
                      {value}
                    </button>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            )
          })}
        </dl>

        {error && <ErrorText message={error} />}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!changed}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-opacity disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Dialog>
  )
}
