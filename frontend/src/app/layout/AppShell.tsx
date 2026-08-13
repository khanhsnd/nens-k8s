import { useEffect, useMemo, useState } from 'react'
import {
  activeCluster,
  subscribeClusterEvents,
  useClusters,
} from '@/features/clusters/cluster.store'
import { clusterResources, useDiscovery } from '@/features/discovery/discovery.store'
import { Dock } from '@/features/dock/Dock'
import { useDock } from '@/features/dock/dock.store'
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
import { cn } from '@/shared/lib/cn'
import { Placeholder } from '@/shared/ui/Placeholder'
import { CommandPalette } from './CommandPalette'
import { DetailDrawer } from './DetailDrawer'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { TopBar } from './TopBar'

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

  const [selected, setSelected] = useState<{ key: string; uid: string } | null>(null)
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

  // One tab is one leaf, except Overview, which reads several — so the wanted
  // kinds are deduplicated: subscribing the same slice twice would leak a token.
  useEffect(() => {
    const kinds = new Map<string, Kind>()
    for (const item of tabs) {
      for (const leafId of item.leafId === 'overview' ? OVERVIEW_KINDS : [item.leafId]) {
        const kind = kindFor(leafId, resources)
        if (kind) kinds.set(kind.id, kind)
      }
    }
    void sync(phase === 'connected' ? clusterId : null, [...kinds.values()])
  }, [clusterId, phase, tabs, resources, sync])

  const kind = tab ? kindFor(tab.leafId, resources) : null
  const key = clusterId && kind ? sliceKey(clusterId, kind.id) : null
  const selectedObject = useResources((s) =>
    selected && selected.key === key ? s.slices[key]?.objects.get(selected.uid) : undefined,
  )

  // Nothing polls metrics.k8s.io unless what is on screen shows usage.
  const wantsMetrics = tab?.leafId === 'overview' || Boolean(kind?.metrics)
  useEffect(() => {
    follow(wantsMetrics && phase === 'connected' ? clusterId : null)
  }, [follow, wantsMetrics, phase, clusterId])

  const usage = useUsage(kind)
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
    if (!kind) return <Placeholder label={`${tab.title} — not wired up yet`} />
    if (!key) return <Placeholder label="Select a cluster to load resources" />

    return (
      <ResourceView
        kind={kind}
        sliceKey={key}
        selectedUid={selected?.key === key ? selected.uid : null}
        onSelect={(row) =>
          guard(() =>
            setSelected((current) =>
              current?.uid === row.metadata.uid ? null : { key, uid: row.metadata.uid },
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

        {detail && kind && clusterId && (
          <DetailDrawer
            object={detail}
            kind={kind}
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
