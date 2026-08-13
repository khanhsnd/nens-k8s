import { Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { DataGrid } from '@/shared/ui/DataGrid'
import { BulkDeleteDialog } from './BulkDeleteDialog'
import { CreateDialog } from './CreateDialog'
import { canCreate, type Kind } from './kinds'
import { useNamespaceFilter } from './namespace.store'
import { NamespaceFilter } from './NamespaceFilter'
import type { K8sObject } from './resource.types'

export function ResourceTable({
  kind,
  clusterId,
  rows,
  selectedUid,
  onSelect,
  notice,
}: {
  kind: Kind
  clusterId: string
  rows: K8sObject[]
  selectedUid: string | null
  onSelect: (row: K8sObject) => void
  notice?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useNamespaceFilter()
  const [creating, setCreating] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  // A tick belongs to the table it was made in: another kind, or another cluster,
  // has different objects behind the same uids.
  useEffect(() => setPicked(new Set()), [kind.id, clusterId])

  const namespaces = useMemo(
    () => [...new Set(rows.map((row) => row.metadata.namespace ?? ''))].filter(Boolean).sort(),
    [rows],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    // The filter belongs to the cluster, so it is set from any table — but a
    // cluster-scoped kind has no namespace to match, and applying it there empties
    // the table with no visible filter to explain it.
    const scope = new Set(kind.namespaced ? chosen : [])

    return rows.filter(
      (row) =>
        (scope.size === 0 || scope.has(row.metadata.namespace ?? '')) &&
        (needle === '' ||
          kind.columns.some((column) => column.text(row).toLowerCase().includes(needle))),
    )
  }, [rows, chosen, query, kind])

  // Rows can be deleted or filtered away under a tick, so what is acted on is
  // always the intersection with what is on screen.
  const targets = useMemo(
    () => visible.filter((row) => picked.has(row.metadata.uid)),
    [visible, picked],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Filter ${kind.id}`}
            className="w-64 rounded-md border border-line bg-base py-1.5 pl-8 pr-2.5 text-sm text-text outline-none placeholder:text-faint focus:border-accent/60"
          />
        </div>

        {kind.namespaced && (
          <NamespaceFilter namespaces={namespaces} value={chosen} onChange={setChosen} />
        )}

        {targets.length > 0 && (
          <button
            onClick={() => setDeleting(true)}
            title={`Delete ${targets.length} selected`}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-base"
          >
            <Trash2 className="size-4" />
            Delete {targets.length}
          </button>
        )}

        {canCreate(kind) && (
          <button
            onClick={() => setCreating(true)}
            title={`New ${kind.kind}`}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-2.5 py-1.5 text-sm font-medium text-base transition-opacity hover:opacity-90"
          >
            <Plus className="size-4" />
            New {kind.kind}
          </button>
        )}

        {notice && <div className="ml-auto truncate text-xs">{notice}</div>}
      </div>

      {creating && (
        // The filter is where the user already said which namespace they mean; a
        // filter over several has no single answer, so the template falls back.
        <CreateDialog
          kind={kind}
          namespace={chosen.length === 1 ? chosen[0] : ''}
          onClose={() => setCreating(false)}
        />
      )}

      {deleting && (
        <BulkDeleteDialog
          kind={kind}
          clusterId={clusterId}
          objects={targets}
          onClose={() => setDeleting(false)}
          onDeleted={(deleted) =>
            setPicked((current) => {
              const next = new Set(current)
              for (const uid of deleted) next.delete(uid)
              return next
            })
          }
        />
      )}

      <DataGrid
        layoutId={kind.id}
        rows={visible}
        columns={kind.columns}
        rowKey={(row) => row.metadata.uid}
        activeKey={selectedUid}
        onActivate={onSelect}
        picks={{ keys: picked, onChange: setPicked }}
      />
    </div>
  )
}
