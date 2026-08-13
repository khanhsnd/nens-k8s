import { Copy, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { copyText } from '@/shared/lib/clipboard'
import { age } from '@/shared/lib/format'
import { CodeEditor } from '@/shared/ui/CodeEditor'
import { Dialog } from '@/shared/ui/Dialog'
import { Field } from '@/shared/ui/Field'
import { usePanelSize } from '@/shared/ui/panel.size'
import { Placeholder } from '@/shared/ui/Placeholder'
import { Resizer } from '@/shared/ui/Resizer'
import { detailOf } from './helm.api'
import { useHelm } from './helm.store'
import { chartOf, refOf, type HelmDetail, type HelmRef, type HelmRelease } from './helm.types'
import { ReleaseHistory } from './ReleaseHistory'
import { ReleaseStatusPill } from './release.columns'

const TABS = ['Overview', 'Values', 'Manifest', 'Notes', 'History'] as const

function UninstallDialog({
  target,
  onClose,
  onDone,
}: {
  target: HelmRef
  onClose: () => void
  onDone: () => void
}) {
  const uninstall = useHelm((state) => state.uninstall)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      await uninstall(target)
      onDone()
    } catch (failure) {
      setError(String(failure))
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Uninstall ${target.name}?`} onClose={onClose}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted">
          Helm deletes every resource this release owns in {target.namespace}, and its history with
          them. This cannot be undone.
        </p>
        {error && <p className="font-mono text-xs text-danger">{error}</p>}

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
            className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-base transition-opacity disabled:opacity-40"
          >
            {busy ? 'Uninstalling…' : 'Uninstall'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function Overview({ release, detail }: { release: HelmRelease; detail: HelmDetail | null }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <dl className="text-sm">
        <Field label="Namespace" value={release.namespace} />
        <Field label="Revision" value={String(release.revision)} />
        <Field label="Status" value={<ReleaseStatusPill status={release.status} />} />
        <Field label="Chart" value={chartOf(release)} />
        <Field label="App version" value={release.appVersion || '—'} />
        <Field label="Updated" value={release.updated ? `${age(release.updated)} ago` : '—'} />
      </dl>

      {release.description && (
        <p className="mt-4 rounded-md bg-raised px-3 py-2 text-sm text-muted">
          {release.description}
        </p>
      )}

      {detail && detail.values === '' && (
        <p className="mt-4 text-xs text-faint">Installed with the chart's own values.</p>
      )}
    </div>
  )
}

export function ReleaseDrawer({
  release,
  onClose,
}: {
  release: HelmRelease
  onClose: () => void
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Overview')
  const [width, setWidth] = usePanelSize('drawer', { initial: 460, min: 360, max: 1100 })
  const [detail, setDetail] = useState<HelmDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState(false)

  const target = useMemo(
    () => refOf(release),
    [release.clusterId, release.namespace, release.name],
  )

  // Re-read on a new revision too: a rollback changes what "current" means.
  useEffect(() => {
    let live = true
    setDetail(null)
    setError(null)

    detailOf(target, 0)
      .then((next) => live && setDetail(next))
      .catch((failure) => live && setError(String(failure)))

    return () => {
      live = false
    }
  }, [target, release.revision])

  function content() {
    if (error) return <Placeholder label={error} />
    if (tab === 'Overview') return <Overview release={release} detail={detail} />
    if (tab === 'History') return <ReleaseHistory target={target} current={release.revision} />
    if (!detail) return <Placeholder label="Reading the release…" />

    if (tab === 'Values') {
      if (detail.values === '') return <Placeholder label="No values — the chart's defaults" />
      return <CodeEditor value={detail.values} />
    }
    if (tab === 'Manifest') return <CodeEditor value={detail.manifest} />

    if (!detail.notes) return <Placeholder label="This chart prints no notes" />
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-muted">
        <pre className="whitespace-pre-wrap">{detail.notes}</pre>
      </div>
    )
  }

  return (
    <aside
      style={{ width }}
      className="relative flex max-w-[70vw] shrink-0 flex-col border-l border-line bg-surface"
    >
      <Resizer edge="left" onResize={setWidth} />

      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-4">
        <span className="mr-auto truncate text-md font-semibold">{release.name}</span>

        <button
          onClick={() => void copyText(release.name)}
          title="Copy name"
          className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <Copy className="size-4" />
        </button>
        <button
          onClick={() => setUninstalling(true)}
          title="Uninstall…"
          className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-danger"
        >
          <Trash2 className="size-4" />
        </button>

        <span className="mx-1 h-4 w-px bg-line" />
        <button
          onClick={onClose}
          title="Close"
          className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-text"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex shrink-0 gap-1 border-b border-line px-2">
        {TABS.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={cn(
              'relative px-2.5 py-2 text-sm transition-colors',
              tab === item ? 'text-accent' : 'text-muted hover:text-text',
            )}
          >
            {item}
            {tab === item && (
              <span className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">{content()}</div>

      {uninstalling && (
        <UninstallDialog
          target={target}
          onClose={() => setUninstalling(false)}
          onDone={() => {
            setUninstalling(false)
            onClose()
          }}
        />
      )}
    </aside>
  )
}
