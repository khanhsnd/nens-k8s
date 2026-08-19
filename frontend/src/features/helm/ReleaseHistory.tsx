import { GitCompareArrows, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { age } from '@/shared/lib/format'
import { Dialog } from '@/shared/ui/Dialog'
import { ErrorText } from '@/shared/ui/ErrorText'
import { Placeholder } from '@/shared/ui/Placeholder'
import { historyOf } from './helm.api'
import { useHelm } from './helm.store'
import { chartOf, type HelmRef, type HelmRelease } from './helm.types'
import { ReleaseStatusPill } from './release.columns'
import { RevisionDiff } from './RevisionDiff'

function RollbackDialog({
  target,
  revision,
  onClose,
}: {
  target: HelmRef
  revision: number
  onClose: () => void
}) {
  const rollback = useHelm((state) => state.rollback)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      await rollback(target, revision)
      onClose()
    } catch (failure) {
      setError(String(failure))
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Roll ${target.name} back to revision ${revision}?`} onClose={onClose}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted">
          Helm re-applies what revision {revision} deployed and records the result as a new
          revision, so the history is kept either way.
        </p>
        {error && <ErrorText message={error} className="font-mono" />}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
          >
            Cancel
          </button>
          <button
            onClick={() => void run()}
            disabled={busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-opacity disabled:opacity-40"
          >
            {busy ? 'Rolling back…' : 'Roll back'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function Revision({
  entry,
  current,
  onDiff,
  onRollback,
}: {
  entry: HelmRelease
  current: number
  onDiff: () => void
  onRollback: () => void
}) {
  return (
    <li className="space-y-1.5 rounded-md border border-line bg-base px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm text-accent">v{entry.revision}</span>
        <ReleaseStatusPill status={entry.status} />
        <span className="ml-auto shrink-0 text-xs text-faint">
          {entry.updated ? `${age(entry.updated)} ago` : '—'}
        </span>
      </div>

      <div className="truncate text-xs text-muted" title={entry.description}>
        {chartOf(entry)}
        {entry.description ? ` · ${entry.description}` : ''}
      </div>

      <div className="flex gap-1">
        <button
          onClick={onDiff}
          disabled={entry.revision === current}
          title={`Compare revision ${entry.revision} with ${current}`}
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <GitCompareArrows className="size-3.5" />
          Diff
        </button>
        <button
          onClick={onRollback}
          disabled={entry.revision === current}
          title={`Roll back to revision ${entry.revision}`}
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted transition-colors hover:bg-raised hover:text-warn disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Undo2 className="size-3.5" />
          Roll back
        </button>
      </div>
    </li>
  )
}

export function ReleaseHistory({ target, current }: { target: HelmRef; current: number }) {
  const [history, setHistory] = useState<HelmRelease[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [comparing, setComparing] = useState<number | null>(null)
  const [rollingBack, setRollingBack] = useState<number | null>(null)

  // A rollback adds a revision, so the current one is part of the question.
  useEffect(() => {
    let live = true
    setHistory(null)
    setError(null)
    setComparing(null)

    historyOf(target)
      .then((next) => live && setHistory(next))
      .catch((failure) => live && setError(String(failure)))

    return () => {
      live = false
    }
  }, [target, current])

  if (error) return <Placeholder label={error} />
  if (!history) return <Placeholder label="Reading the history…" />
  if (history.length === 0) return <Placeholder label="No history for this release" />

  if (comparing !== null) {
    return (
      <RevisionDiff
        target={target}
        revisions={history.map((entry) => entry.revision)}
        from={comparing}
        to={current}
        onClose={() => setComparing(null)}
      />
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <ol className="space-y-1.5">
        {history.map((entry) => (
          <Revision
            key={entry.revision}
            entry={entry}
            current={current}
            onDiff={() => setComparing(entry.revision)}
            onRollback={() => setRollingBack(entry.revision)}
          />
        ))}
      </ol>

      {rollingBack !== null && (
        <RollbackDialog
          target={target}
          revision={rollingBack}
          onClose={() => setRollingBack(null)}
        />
      )}
    </div>
  )
}
