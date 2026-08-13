import { useEffect, useMemo, useState } from 'react'
import {
  activeCluster,
  subscribeClusterEvents,
  useClusters,
} from '@/features/clusters/cluster.store'
import { clusterResources, useDiscovery } from '@/features/discovery/discovery.store'
import { Dock } from '@/features/dock/Dock'
import { useDock } from '@/features/dock/dock.store'
import { HelmView } from '@/features/helm/HelmView'
import { subscribeLogEvents } from '@/features/logs/log.store'
import { useMetrics } from '@/features/metrics/metrics.store'
import { useUsage, withUsage } from '@/features/metrics/usage'
import { OverviewView } from '@/features/overview/OverviewView'
import { OVERVIEW_KINDS } from '@/features/overview/overview.model'
import { PortForwardView } from '@/features/portforward/PortForwardView'
import { subscribeForwardEvents, useForwards } from '@/features/portforward/portforward.store'
import { kindFor } from '@/features/resources/catalog'
import { DiscardGuard } from '@/features/resources/DiscardGuard'
import { useEditorGuard } from '@/features/resources/editor.store'
import type { Kind } from '@/features/resources/kinds'
import { sliceKey, subscribeResourceEvents, useResources } from '@/features/resources/resource.store'
import { ResourceView } from '@/features/resources/ResourceView'
import { TabBar } from '@/features/tabs/TabBar'
import { subscribeExecEvents } from '@/features/terminal/terminal.store'
import { activeTab, useTabs } from '@/features/tabs/tab.store'
import { TOPOLOGY_KINDS } from '@/features/topology/topology.model'
import { TopologyView, type Selection } from '@/features/topology/TopologyView'
import { cn } from '@/shared/lib/cn'
import { Placeholder } from '@/shared/ui/Placeholder'
import { CommandPalette } from './CommandPalette'
import { DetailDrawer } from './DetailDrawer'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { TopBar } from './TopBar'

/** A leaf that reads several kinds instead of being one — see `overview.model`. */
const VIEW_KINDS: Record<string, string[]> = {
  overview: OVERVIEW_KINDS,
  topology: TOPOLOGY_KINDS,
}

export function AppShell() {
  const load = useClusters((s) => s.load)
  const clusters = useClusters((s) => s.clusters)
  const clusterId = useClusters((s) => s.activeId)
  const phase = useClusters((s) => activeCluster(s)?.phase ?? null)
  const tabs = useTabs((s) => s.tabs)
  const tab = useTabs(activeTab)
  const resources = useDiscovery(clusterResources(clusterId))
  const sync = useResources((s) => s.sync)
  const guard = useEditorGuard((s) => s.guard)
  const follow = useMetrics((s) => s.follow)
  const dockMaximized = useDock((s) => s.maximized)

  const [selected, setSelected] = useState<Selection | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    void load()
    return subscribeClusterEvents()
  }, [load])

  useEffect(() => subscribeResourceEvents(), [])

  useEffect(() => subscribeLogEvents(), [])

  useEffect(() => subscribeExecEvents(), [])

  useEffect(() => {
    void useForwards.getState().load()
    return subscribeForwardEvents()
  }, [])

  // The API surface and the saved forwards both follow connections, not renders
  // — each store syncs once per connection, so re-running this per cluster event
  // costs nothing.
  useEffect(() => {
    const connected = clusters.filter((item) => item.phase === 'connected').map((item) => item.id)
    void useDiscovery.getState().sync(connected)
    void useForwards.getState().sync(connected)
  }, [clusters])

  // One tab is one leaf, except the views that read several — so the wanted
  // kinds are deduplicated: subscribing the same slice twice would leak a token.
  useEffect(() => {
    const kinds = new Map<string, Kind>()
    for (const item of tabs) {
      for (const leafId of VIEW_KINDS[item.leafId] ?? [item.leafId]) {
        const kind = kindFor(leafId, resources)
        if (kind) kinds.set(kind.id, kind)
      }
    }
    void sync(phase === 'connected' ? clusterId : null, [...kinds.values()])
  }, [clusterId, phase, tabs, resources, sync])

  const kind = tab ? kindFor(tab.leafId, resources) : null

  // The selection carries its own kind, because the topology hands back objects
  // of every kind — but a table still only owns the rows it drew.
  const selectedKind = selected ? kindFor(selected.kindId, resources) : null
  const owned = tab?.leafId === 'topology' || (selected !== null && selected.kindId === kind?.id)
  const selectedKey = clusterId && selected && owned ? sliceKey(clusterId, selected.kindId) : null
  const selectedObject = useResources((s) =>
    selectedKey ? s.slices[selectedKey]?.objects.get(selected!.uid) : undefined,
  )

  // Nothing polls metrics.k8s.io unless what is on screen shows usage.
  const wantsMetrics =
    tab?.leafId === 'overview' || tab?.leafId === 'topology' || Boolean(kind?.metrics)
  useEffect(() => {
    follow(wantsMetrics && phase === 'connected' ? clusterId : null)
  }, [follow, wantsMetrics, phase, clusterId])

  const usage = useUsage(selectedKind)
  const detail = useMemo(
    () => selectedObject && withUsage(usage, selectedObject),
    [selectedObject, usage],
  )

  function content() {
    if (!tab) return <Placeholder label="No open tab — pick a resource from the sidebar" />
    if (tab.leafId === 'portforward') return <PortForwardView />
    if (tab.leafId === 'overview') {
      if (!clusterId) return <Placeholder label="Select a cluster to see its overview" />
      return <OverviewView clusterId={clusterId} />
    }
    if (tab.leafId === 'releases') {
      if (!clusterId) return <Placeholder label="Select a cluster to see its Helm releases" />
      return <HelmView clusterId={clusterId} />
    }
    if (tab.leafId === 'topology') {
      if (!clusterId) return <Placeholder label="Select a cluster to see its topology" />
      return (
        <TopologyView
          clusterId={clusterId}
          selected={selected}
          onSelect={(pick) => guard(() => setSelected(pick))}
        />
      )
    }
    if (!kind) return <Placeholder label={`${tab.title} — not wired up yet`} />
    if (!clusterId) return <Placeholder label="Select a cluster to load resources" />

    return (
      <ResourceView
        kind={kind}
        sliceKey={sliceKey(clusterId, kind.id)}
        selectedUid={selected?.kindId === kind.id ? selected.uid : null}
        onSelect={(row) =>
          guard(() =>
            setSelected((current) =>
              current?.uid === row.metadata.uid ? null : { kindId: kind.id, uid: row.metadata.uid },
            ),
          )
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex min-h-0 flex-1', dockMaximized && 'hidden')}>
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenPalette={() => setPaletteOpen(true)} />
          <TabBar />
          <div key={tab?.id ?? 'empty'} className="flex min-h-0 flex-1 flex-col">
            {content()}
          </div>
        </main>

        {detail && selectedKind && clusterId && (
          <DetailDrawer
            object={detail}
            kind={selectedKind}
            clusterId={clusterId}
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      <Dock />
      <StatusBar />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <DiscardGuard />
    </div>
  )
}
