import { ChevronDown, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { DataGrid } from '@/shared/ui/DataGrid'
import type { Kind } from './kinds'
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
  const [namespace, setNamespace] = useState('all')

  const namespaces = useMemo(
    () => [...new Set(rows.map((row) => row.metadata.namespace ?? ''))].filter(Boolean).sort(),
    [rows],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter(
      (row) =>
        (namespace === 'all' || row.metadata.namespace === namespace) &&
        (needle === '' ||
          kind.columns.some((column) => column.text(row).toLowerCase().includes(needle))),
    )
  }, [rows, namespace, query, kind])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Filter ${kind.id}`}
            className="w-64 rounded-md border border-line bg-base py-1.5 pl-8 pr-2.5 text-[12px] text-text outline-none placeholder:text-faint focus:border-accent/60"
          />
        </div>

        {kind.namespaced && (
          <div className="relative">
            <select
              value={namespace}
              onChange={(event) => setNamespace(event.target.value)}
              className="appearance-none rounded-md border border-line bg-base py-1.5 pl-2.5 pr-7 text-[12px] text-text outline-none focus:border-accent/60"
            >
              <option value="all">All namespaces</option>
              {namespaces.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          </div>
        )}

        {notice && <div className="ml-auto truncate text-[11px]">{notice}</div>}
      </div>

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
