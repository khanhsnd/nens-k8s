import { RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNamespaceFilter } from '@/features/resources/namespace.store'
import { NamespaceFilter } from '@/features/resources/NamespaceFilter'
import { DataGrid } from '@/shared/ui/DataGrid'
import { Placeholder } from '@/shared/ui/Placeholder'
import { useHelm } from './helm.store'
import { releaseKey, type HelmRelease } from './helm.types'
import { RELEASE_COLUMNS } from './release.columns'
import { ReleaseDrawer } from './ReleaseDrawer'

function compare(a: HelmRelease, b: HelmRelease) {
  return a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name)
}

/**
 * Releases are a view rather than a kind — they have no GVR and no informer —
 * so this owns its own fetch and its own drawer, the way Port Forwarding does.
 */
export function HelmView({ clusterId }: { clusterId: string }) {
  const releases = useHelm((state) => state.releases)
  const loading = useHelm((state) => state.loading)
  const error = useHelm((state) => state.error)
  const load = useHelm((state) => state.load)

  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useNamespaceFilter()
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    void load(clusterId)
  }, [clusterId, load])

  const namespaces = useMemo(
    () => [...new Set(releases.map((release) => release.namespace))].sort(),
    [releases],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const scope = new Set(chosen)

    return releases
      .filter(
        (release) =>
          (scope.size === 0 || scope.has(release.namespace)) &&
          (needle === '' ||
            RELEASE_COLUMNS.some((column) => column.text(release).toLowerCase().includes(needle))),
      )
      .sort(compare)
  }, [releases, chosen, query])

  // Looked up rather than held, so a rollback's new revision reaches the drawer
  // and an uninstalled release closes it.
  const release = releases.find((item) => releaseKey(item) === selected) ?? null

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter releases"
              className="w-64 rounded-md border border-line bg-base py-1.5 pl-8 pr-2.5 text-sm text-text outline-none placeholder:text-faint focus:border-accent/60"
            />
          </div>

          <NamespaceFilter namespaces={namespaces} value={chosen} onChange={setChosen} />

          <button
            onClick={() => void load(clusterId)}
            disabled={loading}
            title="Re-read the releases"
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>

          <div className="ml-auto truncate text-xs">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : loading ? (
              <span className="text-faint">reading…</span>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <Placeholder
            label={
              loading
                ? 'Reading releases…'
                : releases.length === 0
                  ? 'No Helm releases in this cluster'
                  : 'No release matches the filter'
            }
          />
        ) : (
          <DataGrid
            layoutId="helm-releases"
            rows={rows}
            columns={RELEASE_COLUMNS}
            rowKey={releaseKey}
            activeKey={selected}
            onActivate={(row) =>
              setSelected((current) => (current === releaseKey(row) ? null : releaseKey(row)))
            }
          />
        )}
      </div>

      {release && <ReleaseDrawer release={release} onClose={() => setSelected(null)} />}
    </div>
  )
}
