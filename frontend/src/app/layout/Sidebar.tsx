import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AddClusterDialog } from '@/features/clusters/AddClusterDialog'
import { useClusters } from '@/features/clusters/cluster.store'
import { ClusterNode } from '@/features/clusters/ClusterNode'
import { NavTree } from '@/features/navigation/NavTree'
import { usePanelSize } from '@/shared/ui/panel.size'
import { Resizer } from '@/shared/ui/Resizer'

export function Sidebar() {
  const [width, setWidth] = usePanelSize('sidebar', { initial: 264, min: 220, max: 480 })
  const clusters = useClusters((s) => s.clusters)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  return (
    <aside
      style={{ width }}
      className="relative flex max-w-[40vw] shrink-0 flex-col border-r border-line bg-surface"
    >
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <span className="flex-1 truncate pl-1 text-2xs font-semibold uppercase tracking-wider text-faint">
          Clusters
        </span>
        <button
          onClick={() => setAdding(true)}
          title="Add kubeconfig"
          aria-label="Add kubeconfig"
          className="grid size-6 shrink-0 place-items-center rounded text-faint transition-colors hover:bg-raised hover:text-text"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="px-2 pt-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter resources"
          className="w-full rounded-md border border-line bg-base px-2.5 py-1.5 text-sm text-text placeholder:text-faint outline-none focus:border-accent/60"
        />
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {clusters.map((cluster) => (
          <ClusterNode key={cluster.id} cluster={cluster}>
            <NavTree query={query} />
          </ClusterNode>
        ))}
        {clusters.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-faint">
            No kubeconfig contexts found
          </p>
        )}
      </div>

      <AddClusterDialog open={adding} onClose={() => setAdding(false)} />
      <Resizer edge="right" onResize={setWidth} />
    </aside>
  )
}
