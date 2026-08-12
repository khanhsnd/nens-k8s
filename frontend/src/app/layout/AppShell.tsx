import { useEffect, useState } from 'react'
import {
  activeCluster,
  subscribeClusterEvents,
  useClusters,
} from '@/features/clusters/cluster.store'
import { kindFor, type Kind } from '@/features/resources/kinds'
import { sliceKey, subscribeResourceEvents, useResources } from '@/features/resources/resource.store'
import { ResourceView } from '@/features/resources/ResourceView'
import { TabBar } from '@/features/tabs/TabBar'
import { activeTab, useTabs } from '@/features/tabs/tab.store'
import { Placeholder } from '@/shared/ui/Placeholder'
import { ClusterRail } from './ClusterRail'
import { CommandPalette } from './CommandPalette'
import { DetailDrawer } from './DetailDrawer'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { TopBar } from './TopBar'

export function AppShell() {
  const load = useClusters((s) => s.load)
  const clusterId = useClusters((s) => s.activeId)
  const phase = useClusters((s) => activeCluster(s)?.phase ?? null)
  const tabs = useTabs((s) => s.tabs)
  const tab = useTabs(activeTab)
  const sync = useResources((s) => s.sync)

  const [selected, setSelected] = useState<{ key: string; uid: string } | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    void load()
    return subscribeClusterEvents()
  }, [load])

  useEffect(() => subscribeResourceEvents(), [])

  useEffect(() => {
    const kinds = tabs
      .map((item) => kindFor(item.leafId))
      .filter((kind): kind is Kind => kind !== null)
    void sync(phase === 'connected' ? clusterId : null, kinds)
  }, [clusterId, phase, tabs, sync])

  const kind = tab ? kindFor(tab.leafId) : null
  const key = clusterId && kind ? sliceKey(clusterId, kind.id) : null
  const selectedObject = useResources((s) =>
    selected && selected.key === key ? s.slices[key]?.objects.get(selected.uid) : undefined,
  )

  function content() {
    if (!tab) return <Placeholder label="No open tab — pick a resource from the sidebar" />
    if (!kind) return <Placeholder label={`${tab.title} — not wired up yet`} />
    if (!key) return <Placeholder label="Select a cluster to load resources" />

    return (
      <ResourceView
        kind={kind}
        sliceKey={key}
        selectedUid={selected?.key === key ? selected.uid : null}
        onSelect={(row) =>
          setSelected((current) =>
            current?.uid === row.metadata.uid ? null : { key, uid: row.metadata.uid },
          )
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        <ClusterRail />
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenPalette={() => setPaletteOpen(true)} />
          <TabBar />
          <div key={tab?.id ?? 'empty'} className="flex min-h-0 flex-1 flex-col">
            {content()}
          </div>
        </main>

        {selectedObject && kind && (
          <DetailDrawer object={selectedObject} kind={kind} onClose={() => setSelected(null)} />
        )}
      </div>

      <StatusBar />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
