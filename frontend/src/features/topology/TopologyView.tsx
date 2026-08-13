import { FoldVertical, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useMetrics } from '@/features/metrics/metrics.store'
import { useNamespaceFilter } from '@/features/resources/namespace.store'
import { NamespaceFilter } from '@/features/resources/NamespaceFilter'
import { cn } from '@/shared/lib/cn'
import { Placeholder } from '@/shared/ui/Placeholder'
import { TopologyCanvas } from './TopologyCanvas'
import { layout as arrange } from './topology.layout'
import { build, nodeId, workloadKey, MAX_NODES } from './topology.model'
import { useTopology, useTopologySources } from './topology.store'
import { LAYER_LABELS, type Layer } from './topology.types'

/** Workloads are always drawn and pods follow their workload, so neither toggles. */
const TOGGLES: Layer[] = ['ingress', 'service', 'node']

const NAMESPACED = ['deployments', 'statefulsets', 'daemonsets', 'jobs', 'services', 'ingresses']

export type Selection = { kindId: string; uid: string }

export function TopologyView({
  clusterId,
  selected,
  onSelect,
}: {
  clusterId: string
  selected: Selection | null
  onSelect: (selection: Selection | null) => void
}) {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useNamespaceFilter()

  const sources = useTopologySources(clusterId)
  const usage = useMetrics((state) => state.usage)
  const layers = useTopology((state) => state.layers)
  const expanded = useTopology((state) => state.expanded)
  const toggleLayer = useTopology((state) => state.toggleLayer)
  const toggleExpanded = useTopology((state) => state.toggleExpanded)
  const collapseAll = useTopology((state) => state.collapseAll)

  const namespaces = useMemo(() => {
    const found = new Set<string>()
    for (const kindId of NAMESPACED) {
      for (const object of sources[kindId]?.values() ?? []) {
        if (object.metadata.namespace) found.add(object.metadata.namespace)
      }
    }
    return [...found].sort()
  }, [sources])

  const graph = useMemo(
    () => build(sources, { namespaces: scope, layers, expanded, usage }),
    [sources, scope, layers, expanded, usage],
  )

  const layout = useMemo(() => arrange(graph), [graph])

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return null

    return new Set(
      graph.nodes
        .filter((node) =>
          [node.name, node.namespace, node.kind, node.status].some((field) =>
            field.toLowerCase().includes(needle),
          ),
        )
        .map((node) => node.id),
    )
  }, [graph.nodes, query])

  const selectedId = selected ? nodeId(selected.kindId, selected.uid) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-surface px-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Highlight in the graph"
            className="w-64 rounded-md border border-line bg-base py-1.5 pl-8 pr-2.5 text-sm text-text outline-none placeholder:text-faint focus:border-accent/60"
          />
        </div>

        <NamespaceFilter namespaces={namespaces} value={scope} onChange={setScope} />

        <div className="flex items-center gap-1 rounded-md border border-line bg-base p-0.5">
          {TOGGLES.map((layer) => (
            <button
              key={layer}
              onClick={() => toggleLayer(layer)}
              title={`Show or hide the ${LAYER_LABELS[layer]} layer`}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                layers[layer] ? 'bg-accent-dim text-accent' : 'text-faint hover:text-text',
              )}
            >
              {LAYER_LABELS[layer]}
            </button>
          ))}
        </div>

        {Object.values(expanded).some(Boolean) && (
          <button
            onClick={collapseAll}
            title="Fold every expanded workload back to a count"
            className="flex items-center gap-1.5 rounded-md border border-line bg-base px-2 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-text"
          >
            <FoldVertical className="size-3.5" />
            Collapse pods
          </button>
        )}

        <div className="ml-auto truncate text-xs text-faint">
          {layout.nodes.length} objects · {layout.edges.length} relations
        </div>
      </div>

      {graph.oversized > 0 ? (
        <Placeholder
          label={`${graph.oversized} objects in scope — more than a graph can say. Pick a namespace to draw at most ${MAX_NODES}.`}
        />
      ) : layout.nodes.length === 0 ? (
        <Placeholder label="Nothing to draw — this scope has no workloads, services or nodes" />
      ) : (
        <TopologyCanvas
          layout={layout}
          selectedId={selectedId}
          matched={matched}
          expanded={expanded}
          onSelect={(node) =>
            onSelect(node.id === selectedId ? null : { kindId: node.kindId, uid: node.uid })
          }
          onExpand={(node) => toggleExpanded(workloadKey(node))}
        />
      )}
    </div>
  )
}
