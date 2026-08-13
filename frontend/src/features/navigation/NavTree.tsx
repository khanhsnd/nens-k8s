import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useClusters } from '@/features/clusters/cluster.store'
import { clusterResources, useDiscovery } from '@/features/discovery/discovery.store'
import { activeTab, useTabs } from '@/features/tabs/tab.store'
import { cn } from '@/shared/lib/cn'
import type { NavSection } from './nav.model'
import { navSections } from './nav.tree'
import { useNav } from './nav.store'

function Section({ section, forceOpen }: { section: NavSection; forceOpen: boolean }) {
  const expanded = useNav((s) => s.expanded[section.id])
  const toggleSection = useNav((s) => s.toggleSection)
  const tab = useTabs(activeTab)
  const openTab = useTabs((s) => s.open)
  const open = forceOpen || expanded
  const Icon = section.icon

  return (
    <div>
      <button
        onClick={() => toggleSection(section.id)}
        className="flex w-full items-center gap-1.5 rounded-md py-[5px] pl-1 pr-2 text-left text-muted transition-colors hover:bg-raised hover:text-text"
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 text-faint transition-transform', open && 'rotate-90')}
        />
        <Icon className="size-4 shrink-0" />
        <span title={section.hint ?? section.label} className="flex-1 truncate text-sm">
          {section.label}
        </span>
      </button>

      {open && (
        <div className="ml-[9px] border-l border-line pl-1">
          {section.children.map((leaf) => {
            const selected = tab?.sectionId === section.id && tab.leafId === leaf.id
            return (
              <button
                key={leaf.id}
                onClick={() => openTab(section.id, leaf.id, leaf.label)}
                className={cn(
                  'block w-full truncate rounded-md py-[5px] pl-7 pr-2 text-left text-sm transition-colors',
                  selected
                    ? 'bg-accent-dim font-medium text-accent'
                    : 'text-muted hover:bg-raised hover:text-text',
                )}
              >
                {leaf.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function NavTree({ query }: { query: string }) {
  const clusterId = useClusters((s) => s.activeId)
  const resources = useDiscovery(clusterResources(clusterId))
  const all = useMemo(() => navSections(resources), [resources])

  const needle = query.trim().toLowerCase()

  // A section whose own label matches keeps all of its children: typing the API
  // group of a CRD is how you look for its kinds — which is why the groups a
  // vendor section stands for are searched too, not only its shortened label.
  const sections = needle
    ? all
        .map((section) =>
          `${section.label} ${section.hint ?? ''}`.toLowerCase().includes(needle)
            ? section
            : {
                ...section,
                children: section.children.filter((leaf) =>
                  leaf.label.toLowerCase().includes(needle),
                ),
              },
        )
        .filter((section) => section.children.length > 0)
    : all

  if (sections.length === 0) {
    return <div className="py-3 pl-7 text-sm text-faint">No resource matches</div>
  }

  return (
    <div className="space-y-0.5">
      {sections.map((section) => (
        <Section key={section.id} section={section} forceOpen={needle !== ''} />
      ))}
    </div>
  )
}
