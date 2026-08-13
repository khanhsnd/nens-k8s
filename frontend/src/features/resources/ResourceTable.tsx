import { Plus, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { DataGrid } from '@/shared/ui/DataGrid'
import { CreateDialog } from './CreateDialog'
import { canCreate, type Kind } from './kinds'
import { useNamespaceFilter } from './namespace.store'
import { NamespaceFilter } from './NamespaceFilter'
import type { K8sObject } from './resource.types'

export function ResourceTable({
  kind,
  rows,
  selectedUid,
  onSelect,
  notice,
}: {
  kind: Kind
  rows: K8sObject[]
  selectedUid: string | null
  onSelect: (row: K8sObject) => void
  notice?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useNamespaceFilter()
  const [creating, setCreating] = useState(false)

  const namespaces = useMemo(
    () => [...new Set(rows.map((row) => row.metadata.namespace ?? ''))].filter(Boolean).sort(),
    [rows],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const scope = new Set(chosen)

    return rows.filter(
      (row) =>
        (scope.size === 0 || scope.has(row.metadata.namespace ?? '')) &&
        (needle === '' ||
          kind.columns.some((column) => column.text(row).toLowerCase().includes(needle))),
    )
  }, [rows, chosen, query, kind])

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

      <DataGrid
        layoutId={kind.id}
        rows={visible}
        columns={kind.columns}
        rowKey={(row) => row.metadata.uid}
        activeKey={selectedUid}
        onActivate={onSelect}
      />
    </div>
  )
}
